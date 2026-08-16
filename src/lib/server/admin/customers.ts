import { createAdminClient } from '@/utils/postgres/admin';
import { Customer } from '@/types/admin';
import { applyBrandFilter, getAdminBrand } from './brand-filter';

export async function getCustomersList(): Promise<Customer[]> {
    const supabase = createAdminClient();
    const brand = await getAdminBrand();

    // 1. Fetch all user profiles
    const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'user')
        .order('created_at', { ascending: false });

    if (!profiles) return [];

    // 2. Fetch all bookings to calculate spend & counts
    // For hotels, we want holder names as fallback
    // For flights, we need to join with passengers
    const [unified, hotels, flights] = await Promise.all([
        applyBrandFilter(supabase.from('unified_bookings').select('user_id, total_price, usd_amount, created_at, status, metadata'), brand),
        applyBrandFilter(supabase.from('bookings').select('user_id, total_price, usd_amount, created_at, status, holder_first_name, holder_last_name'), brand),
        applyBrandFilter(supabase.from('flight_bookings').select('id, user_id, total_price, usd_amount, created_at, status'), brand),
    ]);

    // Fetch passengers for these flights to get names
    const flightIds = (flights.data || []).map((f: any) => f.id);
    const { data: passengers } = flightIds.length > 0
        ? await supabase.from('passengers').select('booking_id, first_name, last_name').in('booking_id', flightIds)
        : { data: [] };

    const allBookings = [
        ...(unified.data || []).map((b: any) => ({ ...b, type: 'unified' as const })),
        ...(hotels.data || []).map((b: any) => ({ ...b, type: 'hotel' as const })),
        ...(flights.data || []).map((b: any) => {
            const p = (passengers || []).find((pass: any) => pass.booking_id === b.id);
            return { ...b, type: 'flight' as const, passenger_name: p ? `${p.first_name} ${p.last_name}` : null };
        })
    ];

    // 3. Map profiles to Customer data
    return profiles.map((profile: any) => {
        const userBookings = allBookings.filter(b => b.user_id === profile.id);
        const totalBookings = userBookings.length;
        // Spend is in USD, from each booking's locked rate (ADR-0008). This previously
        // summed total_price across currencies with no conversion at all, adding ₩500,000
        // to ₱5,000 as though they were the same unit.
        // Bookings with no locked rate contribute 0 until the backfill resolves them,
        // which understates rather than inflating.
        const totalSpend = userBookings
            .filter(b => b.status === 'confirmed' || b.status === 'ticketed' || b.status === 'booked')
            .reduce((sum, b) => sum + Number(b.usd_amount ?? 0), 0);

        const lastBookingDate = userBookings.length > 0
            ? new Date(Math.max(...userBookings.map(b => new Date(b.created_at).getTime())))
            : null;

        // Fallback name logic
        let displayName = profile.full_name?.trim();

        if (!displayName || displayName.toLowerCase() === 'anonymous' || displayName === '') {
            // Try to find a name from bookings
            const hotelBooking = (userBookings as any[]).find(b => b.type === 'hotel' && b.holder_first_name);
            if (hotelBooking) {
                displayName = `${hotelBooking.holder_first_name} ${hotelBooking.holder_last_name}`.trim();
            } else {
                const flightBooking = (userBookings as any[]).find(b => b.type === 'flight' && b.passenger_name);
                if (flightBooking) {
                    displayName = flightBooking.passenger_name;
                } else {
                    const unifiedBooking = (userBookings as any[]).find(b => b.type === 'unified' && b.metadata?.name);
                    if (unifiedBooking) {
                        displayName = unifiedBooking.metadata?.name;
                    }
                }
            }
        }

        // Calculate a mock loyalty tier based on spend.
        // Thresholds restated in USD now that totalSpend is USD — these are the former
        // ₱10,000 / ₱5,000 / ₱1,000 cutoffs at roughly current rates, kept equivalent so
        // nobody changes tier because of this fix alone. Worth reviewing as a business
        // decision rather than inheriting a converted number.
        let loyaltyTier: 'platinum' | 'gold' | 'silver' | 'bronze' = 'bronze';
        if (totalSpend >= 165) loyaltyTier = 'platinum';
        else if (totalSpend >= 82) loyaltyTier = 'gold';
        else if (totalSpend >= 16) loyaltyTier = 'silver';

        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const status: 'active' | 'inactive' | 'banned' = profile.banned_at
            ? 'banned'
            : lastBookingDate && lastBookingDate >= ninetyDaysAgo ? 'active' : 'inactive';

        return {
            id: profile.id,
            name: displayName || 'Anonymous',
            email: profile.email,
            loyaltyTier,
            status,
            joined: profile.created_at,
            totalSpend,
            totalBookings,
            lastBooking: lastBookingDate ? lastBookingDate.toISOString() : 'N/A'
        };
    });
}