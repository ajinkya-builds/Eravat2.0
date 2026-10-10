import { beforeEach, describe, expect, it, vi } from 'vitest';
import cameraSrc from '../hooks/useCamera.ts?raw';

const shareMock = vi.hoisted(() => vi.fn());
const nativeMock = vi.hoisted(() => vi.fn(() => false));

vi.mock('@capacitor/share', () => ({
  Share: { share: shareMock },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: nativeMock,
    getPlatform: () => (nativeMock() ? 'android' : 'web'),
  },
}));

import translations from '../i18n/translations';
import {
  buildSightingShareText,
  formatShareDateParts,
  mapsLink,
  shareDamageFlags,
  shareNarrative,
  shareOrCopy,
  sightingShareLabels,
  type SightingShareLabels,
} from './reportShare';

const hi: SightingShareLabels = {
  date: 'दिनांक',
  time: 'समय',
  division: 'वनमंडल',
  range: 'वन परिक्षेत्र',
  beat: 'बीट',
  totalElephants: 'कुल हाथी',
  countDetails: 'संख्या विवरण',
  male: 'नर',
  female: 'मादा',
  calf: 'बच्चा',
  unknown: 'अज्ञात',
  cropDamage: 'फसल नुकसान',
  grainDamage: 'अनाज नुकसान',
  houseDamage: 'मकान नुकसान',
  humanLoss: 'जन हानि',
  yes: 'हाँ',
  no: 'नहीं',
  description: 'Description',
  gps: 'निर्देशांक',
  dms: 'GPS स्थान (DMS)',
};

describe('Gaj Rakshak share payload', () => {
  it('formats India date and 12-hour time', () => {
    expect(formatShareDateParts('2026-10-10T12:31:00+05:30')).toEqual({
      date: 'Oct 10, 26',
      time: '12:31 PM',
    });
    expect(formatShareDateParts('2026-10-09T18:08:00+05:30')).toEqual({
      date: 'Oct 9, 26',
      time: '6:08 PM',
    });
  });

  it('matches the field-staff message, with the photo link in the text', () => {
    const text = buildSightingShareText({
      observedAt: '2026-10-10T12:31:00+05:30',
      division: 'Umaria',
      range: 'Chandia',
      beat: 'Majhaganwa',
      male: 1,
      female: 0,
      calf: 0,
      unknown: 0,
      lossDetails: [],
      notes: 'कॉलर नंबर 3 का सिग्नल के आधार पर लोकेशन मिला है.',
      lat: 23.912617,
      lng: 81.1009,
      dms: '23°54\'45.4" N, 81°06\'3.2" E',
      photoUrl: 'https://example.com/sighting.jpeg',
      labels: hi,
    });
    expect(text).toBe(
      [
        'दिनांक - Oct 10, 26',
        'समय - 12:31 PM',
        'वनमंडल - Umaria',
        'वन परिक्षेत्र - Chandia',
        'बीट - Majhaganwa',
        'कुल हाथी - 1',
        'संख्या विवरण - नर - 1',
        'फसल नुकसान - नहीं',
        'अनाज नुकसान - नहीं',
        'मकान नुकसान - नहीं',
        'जन हानि - नहीं',
        'Description: कॉलर नंबर 3 का सिग्नल के आधार पर लोकेशन मिला है.',
        'निर्देशांक: 23.912617, 81.100900',
        'GPS स्थान (DMS): 23°54\'45.4" N, 81°06\'3.2" E',
        '📷  https://example.com/sighting.jpeg',
        '📍 - https://www.google.com/maps?q=23.912617,81.1009',
      ].join('\n'),
    );
    expect(text).not.toContain('एरावत साइटिंग');
    expect(text).not.toContain('साइटिंग का प्रकार');
  });

  it('lists every elephant class that was counted', () => {
    const text = buildSightingShareText({
      male: 1,
      female: 2,
      calf: 1,
      unknown: 0,
      labels: hi,
    });
    expect(text).toContain('कुल हाथी - 4');
    expect(text).toContain('संख्या विवरण - नर - 1, मादा - 2, बच्चा - 1');
  });

  it('marks crop and grain separately, including grain stored as crop', () => {
    expect(shareDamageFlags({ details: ['grain'], categories: ['crop'] })).toEqual({
      crop: false,
      grain: true,
      house: false,
      human: false,
    });
    expect(shareDamageFlags({ details: ['crop', 'grain'], categories: ['crop', 'crop'] })).toMatchObject({
      crop: true,
      grain: true,
    });
    expect(
      shareDamageFlags({
        details: ['property', 'human_injury'],
        categories: ['property', 'human_injury'],
      }),
    ).toMatchObject({ house: true, human: true, crop: false });
  });

  it('keeps a written damage note when it is not just a category token', () => {
    expect(shareNarrative('Herd near naka', 'grain')).toBe('Herd near naka');
    expect(shareNarrative(null, '2 acres of sugarcane')).toBe('2 acres of sugarcane');
  });

  it('uses the same Hindi, English, and Marathi words as the rest of the app', () => {
    for (const lang of ['en', 'hi', 'mr'] as const) {
      const dict = translations[lang];
      expect(dict['share.male']).toBe(dict['map.male']);
      expect(dict['share.female']).toBe(dict['map.female']);
      expect(dict['share.calf']).toBe(dict['map.calf']);
      expect(dict['share.unknown']).toBe(dict['map.unknown']);
      expect(dict['share.date']).toBeTruthy();
      expect(dict['share.yes']).toBeTruthy();
      expect(dict['share.no']).toBeTruthy();
    }

    const text = buildSightingShareText({
      observedAt: '2026-10-10T12:31:00+05:30',
      division: 'Umaria',
      range: 'Chandia',
      beat: 'Majhaganwa',
      male: 1,
      lossDetails: ['crop'],
      damageCategories: ['crop'],
      notes: 'Herd near naka',
      lat: 23.912617,
      lng: 81.1009,
      dms: '23°54\'45.4" N, 81°06\'3.2" E',
      photoUrl: 'https://example.com/sighting.jpeg',
      labels: sightingShareLabels((key) => translations.hi[key]),
    });
    expect(text.startsWith('दिनांक - Oct 10, 26\nसमय - 12:31 PM\nवनमंडल - Umaria')).toBe(true);
    expect(text).toContain('फसल नुकसान - हाँ');
    expect(text).toContain('अनाज नुकसान - नहीं');
    expect(text).toContain('📷  https://example.com/sighting.jpeg');
    expect(text).toContain('📍 - https://www.google.com/maps?q=23.912617,81.1009');
  });

  it('mapsLink is a Google Maps query URL', () => {
    expect(mapsLink(1.5, 2.5)).toBe('https://www.google.com/maps?q=1.5,2.5');
  });
});

describe('share sheet', () => {
  beforeEach(() => {
    shareMock.mockReset();
    nativeMock.mockReset();
    nativeMock.mockReturnValue(false);
  });

  it('opens the Android share sheet with text only', async () => {
    nativeMock.mockReturnValue(true);
    shareMock.mockResolvedValue({ activityType: 'com.whatsapp' });
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });

    const result = await shareOrCopy({ title: 'एरावत साइटिंग', text: 'दिनांक - Oct 10, 26' });

    expect(result).toBe('shared');
    expect(shareMock).toHaveBeenCalledWith({
      title: 'एरावत साइटिंग',
      text: 'दिनांक - Oct 10, 26',
      dialogTitle: 'एरावत साइटिंग',
    });
    expect(shareMock.mock.calls[0][0]).not.toHaveProperty('files');
    expect(shareMock.mock.calls[0][0]).not.toHaveProperty('url');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('does not copy the text when the share sheet is dismissed', async () => {
    nativeMock.mockReturnValue(true);
    shareMock.mockRejectedValue(new Error('Share canceled'));
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });

    await expect(shareOrCopy({ title: 'Sighting', text: 'hello' })).resolves.toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies to the clipboard only when no share sheet is available', async () => {
    nativeMock.mockReturnValue(false);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText }, share: undefined });

    await expect(shareOrCopy({ title: 'Sighting', text: 'hello' })).resolves.toBe('copied');
    expect(shareMock).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith('hello');
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
