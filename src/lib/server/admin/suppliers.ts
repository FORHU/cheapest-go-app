import { createAdminClient } from '@/utils/supabase/admin';
import { fetchAirlinesData } from './providers';

export interface SupplierRecord {
    id: string;
    name: string;
    location: string;
    type: 'hotel' | 'flight';
    bookingCount: number;
    totalRevenue: number;
    currency: string;
    status: 'active' | 'inactive';
    lastBooking: string;
}

export async function getSuppliersList(): Promise<SupplierRecord[]> {
    const supabase = createAdminClient();

    const [unified, legacy, airlines] = await Promise.all([
        supabase.from('unified_bookings').select('type, provider, total_price, currency, status, metadata, created_at'),
        supabase.from('bookings').select('property_name, total_price, currency, status, created_at'),
        fetchAirlinesData()
    ]);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const supplierMap = new Map<string, {
        name: string;
        location: string;
        type: 'hotel' | 'flight';
        bookingCount: number;
        totalRevenue: number;
        currency: string;
        lastBooking: Date;
    }>();

    // Process unified bookings
    (unified.data || []).forEach(b => {
        const meta = b.metadata as any;
        let name: string;
        let location: string;

        if (b.type === 'hotel') {
            name = meta?.hotelName || meta?.hotel_name || meta?.property_name || 'Unknown Hotel';
            location = meta?.city || meta?.destination || meta?.address || 'Unknown';
        } else {
            // Flight — check if owner is an airline, otherwise use provider
            name = meta?.owner?.name || (b.provider || 'unknown').charAt(0).toUpperCase() + (b.provider || 'unknown').slice(1);
            location = meta?.segments?.[0]?.arrival_airport || meta?.destination || 'Various';
        }

        const key = `${b.type}:${name}`;
        const existing = supplierMap.get(key);
        const bookingDate = new Date(b.created_at);
        const isConfirmed = ['confirmed', 'ticketed', 'booked'].includes(b.status);

        if (existing) {
            existing.bookingCount++;
            if (isConfirmed) existing.totalRevenue += Number(b.total_price);
            if (bookingDate > existing.lastBooking) existing.lastBooking = bookingDate;
        } else {
            supplierMap.set(key, {
                name,
                location,
                type: b.type as 'hotel' | 'flight',
                bookingCount: 1,
                totalRevenue: isConfirmed ? Number(b.total_price) : 0,
                currency: b.currency || 'USD',
                lastBooking: bookingDate
            });
        }
    });

    // Process legacy hotel bookings
    (legacy.data || []).forEach(b => {
        if (!b.property_name) return;
        const key = `hotel:${b.property_name}`;
        const existing = supplierMap.get(key);
        const bookingDate = new Date(b.created_at);
        const isConfirmed = ['confirmed', 'ticketed'].includes(b.status);

        if (existing) {
            existing.bookingCount++;
            if (isConfirmed) existing.totalRevenue += Number(b.total_price);
            if (bookingDate > existing.lastBooking) existing.lastBooking = bookingDate;
        } else {
            supplierMap.set(key, {
                name: b.property_name,
                location: 'Unknown',
                type: 'hotel',
                bookingCount: 1,
                totalRevenue: isConfirmed ? Number(b.total_price) : 0,
                currency: b.currency || 'USD',
                lastBooking: bookingDate
            });
        }
    });

    // Process APIs airlines
    airlines.forEach(a => {
        const key = `flight:${a.name}`;
        if (!supplierMap.has(key)) {
            supplierMap.set(key, {
                name: a.name,
                location: 'Global',
                type: 'flight',
                bookingCount: 0,
                totalRevenue: 0,
                currency: 'USD',
                lastBooking: new Date(0)
            });
        }
    });

    return Array.from(supplierMap.entries())
        .map(([key, s]) => ({
            id: key,
            name: s.name,
            location: s.location,
            type: s.type,
            bookingCount: s.bookingCount,
            totalRevenue: s.totalRevenue,
            currency: s.currency,
            status: (s.lastBooking >= thirtyDaysAgo ? 'active' : 'inactive') as 'active' | 'inactive',
            lastBooking: s.lastBooking.toISOString()
        }))
        .sort((a, b) => b.totalRevenue - a.totalRevenue);
}
