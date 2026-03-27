import { createAdminClient } from '@/utils/supabase/admin';
import { Customer } from '@/types/admin';

export async function getCustomersList(): Promise<Customer[]> {
    const supabase = createAdminClient();

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
        supabase.from('unified_bookings').select('user_id, total_price, created_at, status, metadata'),
        supabase.from('bookings').select('user_id, total_price, created_at, status, holder_first_name, holder_last_name'),
        supabase.from('flight_bookings').select('id, user_id, total_price, created_at, status')
    ]);

    // Fetch passengers for these flights to get names
    const flightIds = (flights.data || []).map(f => f.id);
    const { data: passengers } = flightIds.length > 0
        ? await supabase.from('passengers').select('booking_id, first_name, last_name').in('booking_id', flightIds)
        : { data: [] };

    const allBookings = [
        ...(unified.data || []).map(b => ({ ...b, type: 'unified' as const })),
        ...(hotels.data || []).map(b => ({ ...b, type: 'hotel' as const })),
        ...(flights.data || []).map(b => {
            const p = (passengers || []).find(pass => pass.booking_id === b.id);
            return { ...b, type: 'flight' as const, passenger_name: p ? `${p.first_name} ${p.last_name}` : null };
        })
    ];

    // 3. Map profiles to Customer data
    return profiles.map(profile => {
        const userBookings = allBookings.filter(b => b.user_id === profile.id);
        const totalBookings = userBookings.length;
        const totalSpend = userBookings
            .filter(b => b.status === 'confirmed' || b.status === 'ticketed' || b.status === 'booked')
            .reduce((sum, b) => sum + Number(b.total_price), 0);

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

        // Calculate a mock loyalty tier based on spend
        let loyaltyTier: 'platinum' | 'gold' | 'silver' | 'bronze' = 'bronze';
        if (totalSpend >= 10000) loyaltyTier = 'platinum';
        else if (totalSpend >= 5000) loyaltyTier = 'gold';
        else if (totalSpend >= 1000) loyaltyTier = 'silver';

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