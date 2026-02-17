/**
 * Server-side data fetching for facilities.
 * Fetches from LiteAPI Edge Function with fallback to constants.
 */

import { invokeEdgeFunction } from '@/utils/supabase/functions';
import { FACILITIES } from '@/lib/constants';

export interface Facility {
  id: number;
  name: string;
}

/**
 * Fetch facilities from LiteAPI server-side.
 * Falls back to hardcoded FACILITIES constant on error.
 */
export async function fetchFacilities(): Promise<Facility[]> {
  try {
    const result = await invokeEdgeFunction('liteapi-facilities', {});
    return result?.data ?? FACILITIES.map(f => ({ id: f.id, name: f.label }));
  } catch (error) {
    console.error('Failed to fetch facilities:', error);
    return FACILITIES.map(f => ({ id: f.id, name: f.label }));
  }
}
