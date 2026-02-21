#!/usr/bin/env python3
"""
Converts MP forest department shapefiles (Division/Range/Beat)
from MP Transverse Mercator → WGS84 (SRID 4326) and outputs SQL
ready for Supabase/PostGIS.

Strategy:
- Divisions: Use Division.shp for geometry (7 territorial divisions).
  Remaining divisions (NPs) are derived from unique Div_Name values in Range.shp
  (they get boundary=NULL as they're not in the main Division.shp).
- Ranges: Use Range.shp (one row per range). Join to divisions by Div_Name.
- Beats: Use Beat.shp, aggregate compartment-level rows by (Div,Range,Beat) name
  into a single MULTIPOLYGON per unique beat.

Schema changes needed:
- geo_divisions: ADD COLUMN boundary geography(MULTIPOLYGON,4326) IF NOT EXISTS
- geo_ranges: ADD COLUMN boundary geography(MULTIPOLYGON,4326) IF NOT EXISTS
- geo_beats.boundary already exists as geography(polygon,4326) — we ALTER to MULTIPOLYGON
"""

import shapefile
from pyproj import Transformer
import uuid
import sys
from collections import defaultdict

SHP_BASE = '/Volumes/Eravat/elephant-watch-app/Shape_Files/Shp file'
OUTPUT = '/tmp/mp_geography_seed.sql'

# MP Transverse Mercator → WGS84
transformer = Transformer.from_crs(
    "+proj=tmerc +lat_0=24 +lon_0=78.4166666666 +k=0.999443747 +x_0=500000 +y_0=500000 +datum=WGS84 +units=m +no_defs",
    "EPSG:4326",
    always_xy=True
)

def points_to_wgs84(points):
    result = []
    for x, y in points:
        lon, lat = transformer.transform(x, y)
        result.append((lon, lat))
    return result

def shapes_to_multipolygon_wkt(shapes_rings):
    """
    Given a list of ring-point-lists, build MULTIPOLYGON WKT.
    shapes_rings: [ [(lon,lat),...], ... ]  — each inner list is one closed ring
    Each ring becomes one polygon in the MULTIPOLYGON.
    """
    polygons = []
    for ring in shapes_rings:
        if ring[0] != ring[-1]:
            ring = ring + [ring[0]]
        coords_str = ', '.join(f'{lon:.7f} {lat:.7f}' for lon, lat in ring)
        polygons.append(f'(({coords_str}))')
    return 'MULTIPOLYGON(' + ', '.join(polygons) + ')'

def shape_to_rings(shape):
    """Extract rings from a shapefile shape object."""
    parts = list(shape.parts) + [len(shape.points)]
    rings = []
    for i in range(len(parts) - 1):
        ring_points = shape.points[parts[i]:parts[i+1]]
        try:
            wgs84 = points_to_wgs84(ring_points)
            rings.append(wgs84)
        except Exception as e:
            print(f"    ring transform error: {e}", file=sys.stderr)
    return rings

def safe_str(val):
    if val is None:
        return 'NULL'
    return "'" + str(val).replace("'", "''").strip() + "'"

def gen_uuid():
    return str(uuid.uuid4())

lines = []
lines.append("-- ============================================================")
lines.append("-- Eravat 2.0 — Madhya Pradesh Forest Geography Seed")
lines.append("-- Source: MP Forest Dept Shapefiles (MULTIPOLYGON)")
lines.append("-- CRS: MP Transverse Mercator → WGS84 SRID 4326")
lines.append("-- ============================================================\n")

# Schema alterations
lines.append("-- Add boundary columns (safe: IF NOT EXISTS)")
lines.append("ALTER TABLE public.geo_divisions ADD COLUMN IF NOT EXISTS boundary geography(MULTIPOLYGON, 4326);")
lines.append("ALTER TABLE public.geo_ranges    ADD COLUMN IF NOT EXISTS boundary geography(MULTIPOLYGON, 4326);\n")

# Clean slate
lines.append("-- Clean slate (order matters: FK constraints)")
lines.append("DELETE FROM public.user_region_assignments;")
lines.append("DELETE FROM public.geo_beats;")
lines.append("DELETE FROM public.geo_ranges;")
lines.append("DELETE FROM public.geo_divisions;\n")

# ── STEP 1: DIVISIONS ─────────────────────────────────────────────────────────
print("Processing Divisions...", file=sys.stderr)
lines.append("-- ── DIVISIONS ──────────────────────────────────────────────")

sf_div = shapefile.Reader(f'{SHP_BASE}/Division.shp')
fields_div = [f[0] for f in sf_div.fields[1:]]

div_name_to_id = {}   # div_name → uuid

# Insert divisions from Division.shp (with geometry)
for sr in sf_div.shapeRecords():
    rec = dict(zip(fields_div, sr.record))
    div_name = str(rec.get('Div_Name', '')).strip()
    if not div_name or div_name in div_name_to_id:
        continue
    uid = gen_uuid()
    div_name_to_id[div_name] = uid
    rings = shape_to_rings(sr.shape)
    if rings:
        wkt = shapes_to_multipolygon_wkt(rings)
        geom_expr = f"ST_GeogFromText('{wkt}')"
    else:
        geom_expr = 'NULL'
    code = ''.join(w[0] for w in div_name.upper().split()[:3]).rstrip('(')
    lines.append(
        f"INSERT INTO public.geo_divisions (id, name, code, state, boundary) VALUES "
        f"('{uid}', {safe_str(div_name)}, {safe_str(code)}, 'Madhya Pradesh', {geom_expr});"
    )

# Discover additional division names from Range.shp (NPs) — no geometry
sf_rng_pre = shapefile.Reader(f'{SHP_BASE}/Range.shp')
fields_rng_pre = [f[0] for f in sf_rng_pre.fields[1:]]
all_div_names_in_ranges = set()
for sr in sf_rng_pre.shapeRecords():
    rec = dict(zip(fields_rng_pre, sr.record))
    dname = str(rec.get('Div_Name', '')).strip()
    if dname:
        all_div_names_in_ranges.add(dname)

extra_divs = all_div_names_in_ranges - set(div_name_to_id.keys())
for div_name in sorted(extra_divs):
    uid = gen_uuid()
    div_name_to_id[div_name] = uid
    code = ''.join(w[0] for w in div_name.upper().split()[:3]).rstrip('(')
    lines.append(
        f"INSERT INTO public.geo_divisions (id, name, code, state, boundary) VALUES "
        f"('{uid}', {safe_str(div_name)}, {safe_str(code)}, 'Madhya Pradesh', NULL);"
    )

print(f"  {len(div_name_to_id)} divisions ({len(div_name_to_id) - len(extra_divs)} with geometry, {len(extra_divs)} geometry-less NPs)", file=sys.stderr)
lines.append("")

# ── STEP 2: RANGES ────────────────────────────────────────────────────────────
print("Processing Ranges...", file=sys.stderr)
lines.append("-- ── RANGES ─────────────────────────────────────────────────")

sf_rng = shapefile.Reader(f'{SHP_BASE}/Range.shp')
fields_rng = [f[0] for f in sf_rng.fields[1:]]

# Aggregate multiple shapefile rows per (div,range) into one MULTIPOLYGON
rng_data = defaultdict(list)   # (div_name, rng_name) → list of rings

for sr in sf_rng.shapeRecords():
    rec = dict(zip(fields_rng, sr.record))
    div_name = str(rec.get('Div_Name', '')).strip()
    rng_name = str(rec.get('RNG_NM', '')).strip()
    if not div_name or not rng_name:
        continue
    rings = shape_to_rings(sr.shape)
    rng_data[(div_name, rng_name)].extend(rings)

rng_key_to_id = {}

for (div_name, rng_name), rings in sorted(rng_data.items()):
    div_id = div_name_to_id.get(div_name)
    if not div_id:
        print(f"  SKIP Range '{rng_name}': no division '{div_name}'", file=sys.stderr)
        continue
    uid = gen_uuid()
    rng_key_to_id[(div_name, rng_name)] = uid
    if rings:
        wkt = shapes_to_multipolygon_wkt(rings)
        geom_expr = f"ST_GeogFromText('{wkt}')"
    else:
        geom_expr = 'NULL'
    code = ''.join(w[0] for w in rng_name.upper().split()[:3]).rstrip('(')
    lines.append(
        f"INSERT INTO public.geo_ranges (id, division_id, name, code, boundary) VALUES "
        f"('{uid}', '{div_id}', {safe_str(rng_name)}, {safe_str(code)}, {geom_expr});"
    )

print(f"  {len(rng_key_to_id)} ranges", file=sys.stderr)
lines.append("")

# ── STEP 3: BEATS ─────────────────────────────────────────────────────────────
print("Processing Beats (aggregating compartments into multipolygons)...", file=sys.stderr)
lines.append("-- ── BEATS ──────────────────────────────────────────────────")

sf_beat = shapefile.Reader(f'{SHP_BASE}/Beat.shp')
fields_beat = [f[0] for f in sf_beat.fields[1:]]

# Aggregate compartment-level rows into unique beats
beat_rings = defaultdict(list)

for sr in sf_beat.shapeRecords():
    rec = dict(zip(fields_beat, sr.record))
    div_name = str(rec.get('Div_Name', '')).strip()
    rng_name = str(rec.get('Range_Name', '')).strip()
    beat_name = str(rec.get('Beat_Name', '')).strip()
    if not beat_name:
        continue
    rings = shape_to_rings(sr.shape)
    beat_rings[(div_name, rng_name, beat_name)].extend(rings)

beat_count = 0
beat_skip = 0

for (div_name, rng_name, beat_name), rings in sorted(beat_rings.items()):
    # Exact match first
    rng_id = rng_key_to_id.get((div_name, rng_name))
    # Fallback: match by range name only
    if not rng_id:
        for (d, r), rid in rng_key_to_id.items():
            if r == rng_name:
                rng_id = rid
                break
    if not rng_id:
        beat_skip += 1
        continue
    uid = gen_uuid()
    if rings:
        wkt = shapes_to_multipolygon_wkt(rings)
        geom_expr = f"ST_GeogFromText('{wkt}')"
    else:
        geom_expr = 'NULL'
    code = ''.join(w[0] for w in beat_name.upper().split()[:3]).rstrip('(')
    lines.append(
        f"INSERT INTO public.geo_beats (id, range_id, name, code, boundary) VALUES "
        f"('{uid}', '{rng_id}', {safe_str(beat_name)}, {safe_str(code)}, {geom_expr});"
    )
    beat_count += 1

print(f"  {beat_count} beats, {beat_skip} skipped", file=sys.stderr)
lines.append("")
lines.append("-- ✓ Seed complete")

with open(OUTPUT, 'w') as f:
    f.write('\n'.join(lines))

print(f"\n✓ SQL written to {OUTPUT}", file=sys.stderr)
print(f"  Total divisions: {len(div_name_to_id)}", file=sys.stderr)
print(f"  Total ranges:    {len(rng_key_to_id)}", file=sys.stderr)
print(f"  Total beats:     {beat_count}", file=sys.stderr)
