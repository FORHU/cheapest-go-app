/**
 * Server-side data fetching for facilities.
 * Fetches from LiteAPI Edge Function with fallback to constants.
 */

import { unstable_cache } from 'next/cache';
import { invokeEdgeFunction } from '@/utils/supabase/functions';
import { FACILITIES } from '@/lib/constants';

export interface Facility {
  id: number;
  name: string;
}

// Facilities are static reference data — cache for 1 hour to avoid hitting the
// LiteAPI rate limit on every search page load (search page is force-dynamic).
const getCachedFacilities = unstable_cache(
  async () => {
    const result = await invokeEdgeFunction('liteapi-facilities', {});
    return (result?.data ?? FACILITIES.map(f => ({ id: f.id, name: f.label }))) as Facility[];
  },
  ['liteapi-facilities'],
  { revalidate: 3600 }
);

/**
 * Fetch facilities from LiteAPI server-side.
 * Falls back to hardcoded FACILITIES constant on error.
 */
export async function fetchFacilities(): Promise<Facility[]> {
  try {
    return await getCachedFacilities();
  } catch (error) {
    console.error('Failed to fetch facilities:', error);
    return FACILITIES.map(f => ({ id: f.id, name: f.label }));
  }
}
