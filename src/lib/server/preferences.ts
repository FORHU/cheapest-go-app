import type { SupabaseClient, User } from '@supabase/supabase-js';

export interface UserPreferences {
  typicalAdults: number;
  typicalChildren: number;
  preferredCabinClass: string;
  budgetRange: 'budget' | 'mid-range' | 'luxury';
  avgHotelStars: number;
  favoriteAirlines: string[];
  favoriteDestinations: string[];
  avgTripDuration: number;
  typicalCurrency: string;
  lastUpdated: string;
}

const DEFAULTS: UserPreferences = {
  typicalAdults: 2,
  typicalChildren: 0,
  preferredCabinClass: 'economy',
  budgetRange: 'mid-range',
  avgHotelStars: 3,
  favoriteAirlines: [],
  favoriteDestinations: [],
  avgTripDuration: 3,
  typicalCurrency: 'USD',
  lastUpdated: '',
};

export async function getPreferences(
  user: User,
  supabase: SupabaseClient,
): Promise<UserPreferences> {
  const { data } = await supabase
    .from('profiles')
    .select('preferences')
    .eq('id', user.id)
    .maybeSingle();

  const stored = (data?.preferences || {}) as Partial<UserPreferences>;
  return { ...DEFAULTS, ...stored };
}

export async function updatePreferences(
  user: User,
  supabase: SupabaseClient,
  patch: Partial<UserPreferences>,
): Promise<UserPreferences> {
  const current = await getPreferences(user, supabase);
  const merged: UserPreferences = {
    ...current,
    ...patch,
    lastUpdated: new Date().toISOString(),
  };

  await supabase
    .from('profiles')
    .update({ preferences: merged })
    .eq('id', user.id);

  return merged;
}

/** Derive preferences from booking history and save them. */
export async function syncPreferencesFromHistory(
  user: User,
  supabase: SupabaseClient,
): Promise<UserPreferences> {
  const [hotelRows, flightRows] = await Promise.all([
    supabase
      .from('bookings')
      .select('adults, children, currency, check_in, check_out, property_name')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('flight_bookings')
      .select('passengers, currency, segments')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const hotels = hotelRows.data || [];
  const flights = flightRows.data || [];

  const patch: Partial<UserPreferences> = {};

  if (hotels.length > 0) {
    // Typical adults = median across hotel bookings
    const adultCounts = hotels.map((h: any) => h.adults || 2).sort((a: number, b: number) => a - b);
    patch.typicalAdults = adultCounts[Math.floor(adultCounts.length / 2)];

    const childCounts = hotels.map((h: any) => h.children || 0).sort((a: number, b: number) => a - b);
    patch.typicalChildren = childCounts[Math.floor(childCounts.length / 2)];

    // Avg trip duration in nights
    const durations = hotels
      .map((h: any) => {
        if (!h.check_in || !h.check_out) return null;
        const diff = (new Date(h.check_out).getTime() - new Date(h.check_in).getTime()) / 86400000;
        return diff > 0 ? diff : null;
      })
      .filter(Boolean) as number[];
    if (durations.length > 0) {
      patch.avgTripDuration = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    }

    // Most used currency
    const currencies = hotels.map((h: any) => h.currency).filter(Boolean);
    if (currencies.length > 0) {
      const freq: Record<string, number> = {};
      for (const c of currencies) freq[c] = (freq[c] || 0) + 1;
      patch.typicalCurrency = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
    }

    // Favorite destinations (city names from property_name heuristic — limited without full data)
    const destinations = hotels
      .map((h: any) => h.property_name)
      .filter(Boolean)
      .slice(0, 5);
    if (destinations.length > 0) {
      patch.favoriteDestinations = [...new Set(destinations)];
    }
  }

  if (flights.length > 0) {
    // Preferred cabin class from passenger records
    const cabinClasses = flights
      .flatMap((f: any) => {
        const segs: any[] = f.segments || [];
        return segs.map((s: any) => s.cabinClass || s.cabin_class).filter(Boolean);
      });
    if (cabinClasses.length > 0) {
      const freq: Record<string, number> = {};
      for (const c of cabinClasses) freq[c] = (freq[c] || 0) + 1;
      patch.preferredCabinClass = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
    }

    // Favorite airlines
    const airlines = flights
      .flatMap((f: any) => {
        const segs: any[] = f.segments || [];
        return segs.map((s: any) => s.airline || s.carrierCode || s.marketingCarrier).filter(Boolean);
      });
    if (airlines.length > 0) {
      const freq: Record<string, number> = {};
      for (const a of airlines) freq[a] = (freq[a] || 0) + 1;
      patch.favoriteAirlines = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k]) => k);
    }
  }

  return updatePreferences(user, supabase, patch);
}

/** Format preferences as a short system-prompt line for the AI. */
export function preferencesToPrompt(prefs: UserPreferences): string {
  if (!prefs.lastUpdated) return '';

  const parts: string[] = [];

  if (prefs.typicalAdults) {
    const p = prefs.typicalAdults === 1 ? '1 adult' : `${prefs.typicalAdults} adults`;
    const c = prefs.typicalChildren > 0 ? ` and ${prefs.typicalChildren} child${prefs.typicalChildren > 1 ? 'ren' : ''}` : '';
    parts.push(`usually travels with ${p}${c}`);
  }
  if (prefs.preferredCabinClass && prefs.preferredCabinClass !== 'economy') {
    parts.push(`prefers ${prefs.preferredCabinClass} class`);
  }
  if (prefs.budgetRange && prefs.budgetRange !== 'mid-range') {
    parts.push(`${prefs.budgetRange} traveler`);
  }
  if (prefs.avgTripDuration) {
    parts.push(`typical trip is ${prefs.avgTripDuration} night${prefs.avgTripDuration !== 1 ? 's' : ''}`);
  }
  if (prefs.favoriteAirlines?.length) {
    parts.push(`often flies ${prefs.favoriteAirlines.slice(0, 2).join(' or ')}`);
  }
  if (prefs.favoriteDestinations?.length) {
    parts.push(`has visited ${prefs.favoriteDestinations.slice(0, 3).join(', ')}`);
  }
  if (prefs.typicalCurrency && prefs.typicalCurrency !== 'USD') {
    parts.push(`prefers ${prefs.typicalCurrency} currency`);
  }

  if (!parts.length) return '';

  return `USER PROFILE: This user ${parts.join(', ')}. Use this to pre-fill defaults and skip asking for info they always give — but still confirm if you are not sure.`;
}
