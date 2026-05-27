import { FACILITIES } from '@/lib/constants';

export interface Facility {
  id: number;
  name: string;
}

export async function fetchFacilities(): Promise<Facility[]> {
  return FACILITIES.map(f => ({ id: f.id, name: f.label }));
}
