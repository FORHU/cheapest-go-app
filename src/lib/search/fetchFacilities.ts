import { FACILITIES } from '@/lib/constants';

export interface Facility {
  id: number;
  name: string;
}

/**
 * Returns facilities from the hardcoded constants.
 * TODO: replace with ONDA facilities endpoint once available.
 */
export async function fetchFacilities(): Promise<Facility[]> {
  return FACILITIES.map(f => ({ id: f.id, name: f.label }));
}
