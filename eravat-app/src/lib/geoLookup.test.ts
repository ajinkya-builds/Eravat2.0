import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cacheGeoFromPoint,
  lookupGeoFromPoint,
  readCachedGeoFromPoint,
  type GeoMatch,
} from './geoLookup';

const match: GeoMatch = {
  division_id: 'div-1',
  division_name: 'Bandhavgarh NP',
  range_id: 'rng-1',
  range_name: 'Khitauli Core',
  beat_id: 'beat-1',
  beat_name: 'Garhpuri',
};

vi.mock('../supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

import { supabase } from '../supabase';

describe('geoLookup point cache (Review 3 §3 / §7)', () => {
  afterEach(() => {
    localStorage.clear();
    vi.mocked(supabase.rpc).mockReset();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  it('caches successful RPC lookups for reuse', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [match], error: null } as never);
    const got = await lookupGeoFromPoint(23.7171, 80.9612);
    expect(got?.beat_name).toBe('Garhpuri');
    expect(readCachedGeoFromPoint(23.7171, 80.9612)?.division_name).toBe('Bandhavgarh NP');
  });

  it('serves cached DRB when offline without calling RPC', async () => {
    cacheGeoFromPoint(23.717, 80.961, match);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const got = await lookupGeoFromPoint(23.717, 80.961);
    expect(got?.range_name).toBe('Khitauli Core');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('falls back to cache when RPC throws', async () => {
    cacheGeoFromPoint(23.72, 80.96, match);
    vi.mocked(supabase.rpc).mockRejectedValue(new Error('network'));
    const got = await lookupGeoFromPoint(23.72, 80.96);
    expect(got?.beat_id).toBe('beat-1');
  });
});
