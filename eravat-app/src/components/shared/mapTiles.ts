/**
 * Basemap tile URLs for every Leaflet map (field map, admin map, dashboards).
 *
 * CARTO Voyager raster tiles (`basemaps.cartocdn.com/rastertiles/voyager`) now
 * return a placeholder stamped "API key required" unless a CARTO key is on the
 * URL. Streets therefore uses the OpenStreetMap standard tile server, which
 * is already allowed by the CSP in index.html.
 */

export const STREETS_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

export const STREETS_TILE_ATTRIBUTION =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Clarity World Imagery. The older server.arcgisonline.com World Imagery endpoint stamps an API-key watermark. */
export const SATELLITE_TILE_URL =
    'https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

export const SATELLITE_TILE_ATTRIBUTION =
    'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics';
