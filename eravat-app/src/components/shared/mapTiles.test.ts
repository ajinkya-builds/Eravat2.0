import { describe, expect, it } from 'vitest';
import { SATELLITE_TILE_URL, STREETS_TILE_URL } from './mapTiles';

describe('map tile urls', () => {
    it('does not use CARTO raster tiles, which watermark API key required', () => {
        expect(STREETS_TILE_URL).not.toMatch(/carto/i);
        expect(SATELLITE_TILE_URL).not.toMatch(/carto/i);
        expect(STREETS_TILE_URL).toContain('tile.openstreetmap.org');
    });

    it('keeps satellite imagery off the ArcGIS host that stamps an API-key watermark', () => {
        expect(SATELLITE_TILE_URL).not.toContain('server.arcgisonline.com');
        expect(SATELLITE_TILE_URL).toContain('clarity.maptiles.arcgis.com');
    });
});
