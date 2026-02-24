import os
import sys
import geopandas as gpd
from shapely.geometry import MultiPolygon, Polygon

SHAPEFILE_MAPPING = {
    "Bandhavgarh NP": {
        "id": "979b722a-de6b-4ddb-9869-6a714748ab29",
        "paths": ["data/Shape_Files/BTR/Bandhavgarh.shp"]
    },
    "Kanha National Park (Buffer)": {
        "id": "5b24915b-1a5a-4f9a-b814-0bcb64853a29",
        "paths": ["data/Shape_Files/Shp file/TR Shp Files/Kanha TR/Buffer Zone/Compartment_Buffer.shp"]
    },
    "Kanha National Park (Core)": {
        "id": "76625c20-c11f-4e86-860e-7f1f6216ae17",
        "paths": [
            "data/Shape_Files/Shp file/TR Shp Files/Kanha TR/Core Zone/CompartmentEdit3.shp",
            "data/Shape_Files/Shp file/TR Shp Files/Kanha TR/Phen/PhenSanctComptt.shp"
        ]
    },
    "Sanjay National Park": {
        "id": "45792010-51f2-4883-ba6e-c714787dd57c",
        "paths": [
            "data/Shape_Files/STR/STR_Boundary.shp",
            "data/Shape_Files/STR/Core_Boundary.shp"
        ]
    }
}

def force_multipolygon(geom):
    if geom.is_empty:
        return None
    if isinstance(geom, Polygon):
        return MultiPolygon([geom])
    elif isinstance(geom, MultiPolygon):
        return geom
    else:
        # If it's a GeometryCollection or something else, try to extract polygons
        polys = []
        if hasattr(geom, "geoms"):
            for g in geom.geoms:
                if isinstance(g, Polygon):
                    polys.append(g)
                elif isinstance(g, MultiPolygon):
                    polys.extend(g.geoms)
        if polys:
            return MultiPolygon(polys)
        return None

def main():
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    out_sql = os.path.join(repo_root, "supabase", "seeds", "02_missing_divisions.sql")
    
    for div_name, data in SHAPEFILE_MAPPING.items():
        div_id = data["id"]
        safe_name = div_name.lower().replace(" ", "_").replace("&", "and").replace("(", "").replace(")", "")
        out_file = os.path.join(repo_root, f"supabase/seeds/boundary_{safe_name}.sql")
        
        geoms = []
        for path in data["paths"]:
            full_path = os.path.join(repo_root, path)
            if not os.path.exists(full_path):
                print(f"Warning: {full_path} not found")
                continue
            
            print(f"Processing {div_name}: {path}")
            gdf = gpd.read_file(full_path)
            
            if gdf.crs is None:
                gdf.set_crs(epsg=4326, inplace=True)
            elif gdf.crs.to_epsg() != 4326:
                gdf = gdf.to_crs(epsg=4326)
            
            union_geom = gdf.geometry.unary_union
            if union_geom:
                geoms.append(union_geom)
        
        if geoms:
            final_union = gpd.GeoSeries(geoms).unary_union
            multi = force_multipolygon(final_union)
            if multi:
                from shapely.ops import transform
                multi_2d = transform(lambda x, y, z=None: (x, y), multi)
                from shapely import wkb
                hex_val = wkb.dumps(multi_2d, hex=True, srid=4326)
                
                # Chunk the hex string to avoid SQL parser limits (chunk size 10,000)
                chunk_size = 10000
                chunks = [hex_val[i:i + chunk_size] for i in range(0, len(hex_val), chunk_size)]
                
                with open(out_file, "w") as f:
                    f.write(f"-- {div_name} Boundary\n")
                    f.write(f"UPDATE public.geo_divisions SET boundary = (\n")
                    for i, chunk in enumerate(chunks):
                        line = f"  '{chunk}'"
                        if i < len(chunks) - 1:
                            line += " ||\n"
                        f.write(line)
                    f.write(f"\n)::extensions.geography WHERE id = '{div_id}';\n")
                print(f"Wrote {out_file}")
            else:
                print(f"Failed to generate MultiPolygon for {div_name}")
    
    print(f"Wrote SQL updates to {out_sql}")

if __name__ == '__main__':
    main()
