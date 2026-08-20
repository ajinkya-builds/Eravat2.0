import { describe, expect, it } from 'vitest';
import { buildSightingShareText, mapsLink } from './reportShare';
import cameraSrc from '../hooks/useCamera.ts?raw';

const labels = {
  title: 'Eravat sighting',
  type: 'Type',
  date: 'Date',
  division: 'Division',
  range: 'Range',
  beat: 'Beat',
  elephants: 'Elephants',
  direction: 'Direction',
  damage: 'Damage',
  gps: 'GPS',
  dms: 'DMS',
  map: 'Map',
  photo: 'Photo',
  description: 'Description',
};

describe('ERV-031 / ERV-040 share payload', () => {
  it('includes type, DRB, count, direction, damage, GPS, Maps link, and photo', () => {
    const text = buildSightingShareText({
      typeLabel: 'Direct',
      dateLabel: '16 Aug 2026',
      division: 'Bandhavgarh NP',
      range: 'Khitauli Core',
      beat: 'Garhpuri',
      elephantTotal: 3,
      directionDeg: 45,
      damage: 'Crop',
      lat: 23.717,
      lng: 80.961,
      dms: '23\u00b043\'N 80\u00b057\'E',
      photoUrl: 'https://example.com/photo.jpg',
      labels,
    });
    expect(text).toContain('Type: Direct');
    expect(text).toContain('Division: Bandhavgarh NP');
    expect(text).toContain('Range: Khitauli Core');
    expect(text).toContain('Beat: Garhpuri');
    expect(text).toContain('Elephants: 3');
    expect(text).toContain('Direction: 45\u00b0');
    expect(text).toContain('Damage: Crop');
    expect(text).toContain('23.717000, 80.961000');
    expect(text).toContain('https://www.google.com/maps?q=23.717,80.961');
    expect(text).toContain('https://example.com/photo.jpg');
  });

  it('mapsLink is a Google Maps query URL', () => {
    expect(mapsLink(1.5, 2.5)).toBe('https://www.google.com/maps?q=1.5,2.5');
  });
});

describe('ERV-044 no 5MB photo cap', () => {
  it('useCamera compresses by max edge, never rejects by file size', () => {
    const src = cameraSrc;
    expect(src).toMatch(/MAX_EDGE\s*=\s*2560/);
    expect(src).not.toMatch(/5\s*\*\s*1024|MAX_FILE_BYTES|if\s*\(.*file\.size/);
    expect(src).toContain('CameraResultType.Uri');
  });
});
