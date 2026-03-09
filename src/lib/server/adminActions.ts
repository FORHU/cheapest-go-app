"use server";

import { createAdminClient } from '@/utils/supabase/admin';
import {
    DashboardStats,
    AnalyticsData,
    SupplierBreakdown,
    RecentActivity,
    AdvancedAnalyticsData,
    RevenueTrend,
    ConversionFunnel,
    RouteMetric,
    DashboardData,
    Booking,
    BookingRawData,
    RecoveryActionResult,
    Customer,
    Notification
} from '@/types/admin';

export async function getDashboardData(): Promise<DashboardData> {
    const supabase = createAdminClient();

    // 1. Fetch Stats from all tables
    const [unifiedRes, legacyHotelRes, legacyFlightRes] = await Promise.all([
        supabase.from('unified_bookings').select('*', { count: 'exact' }),
        supabase.from('bookings').select('*', { count: 'exact' }),
        supabase.from('flight_bookings').select('*', { count: 'exact' })
    ]);

    const totalBookings = (unifiedRes.count || 0) + (legacyHotelRes.count || 0) + (legacyFlightRes.count || 0);

    // Revenue Calculation (Confirmed/Ticketed)
    const [unifiedRev, legacyHotelRev, legacyFlightRev] = await Promise.all([
        supabase.from('unified_bookings').select('total_price, currency').in('status', ['confirmed', 'ticketed']),
        supabase.from('bookings').select('total_price, currency').in('status', ['confirmed', 'ticketed']),
        supabase.from('flight_bookings').select('total_price').in('status', ['booked', 'ticketed'])
    ]);

    const PHP_RATE = 56; // Mock conversion rate

    const revenue = [
        ...(unifiedRev.data || []).map(b => Number(b.total_price) * (b.currency === 'USD' ? PHP_RATE : 1)),
        ...(legacyHotelRev.data || []).map(b => Number(b.total_price) * (b.currency === 'USD' ? PHP_RATE : 1)),
        ...(legacyFlightRev.data || []).map(b => Number(b.total_price) * PHP_RATE) // Legacy flights were USD
    ].reduce((acc, curr) => acc + curr, 0);

    // Round revenue if it's large to keep UI clean
    const displayRevenue = revenue > 1000 ? Math.floor(revenue) : revenue;

    // Pending/Cancelled Stats
    const [unifiedPending, legacyHotelPending, legacyFlightPending] = await Promise.all([
        supabase.from('unified_bookings').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('flight_bookings').select('*', { count: 'exact', head: true }).eq('status', 'pending')
    ]);

    const [unifiedCancelled, legacyHotelCancelled, legacyFlightCancelled] = await Promise.all([
        supabase.from('unified_bookings').select('*', { count: 'exact', head: true }).eq('status', 'cancelled'),
        supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'cancelled'),
        supabase.from('flight_bookings').select('*', { count: 'exact', head: true }).eq('status', 'cancelled')
    ]);

    const pendingBookings = (unifiedPending.count || 0) + (legacyHotelPending.count || 0) + (legacyFlightPending.count || 0);
    const cancelledBookings = (unifiedCancelled.count || 0) + (legacyHotelCancelled.count || 0) + (legacyFlightCancelled.count || 0);

    // 2. Fetch Weekly Analytics
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [unifiedAnalytics, legacyHotelAnalytics, legacyFlightAnalytics] = await Promise.all([
        supabase.from('unified_bookings').select('created_at').gte('created_at', sevenDaysAgo.toISOString()),
        supabase.from('bookings').select('created_at').gte('created_at', sevenDaysAgo.toISOString()),
        supabase.from('flight_bookings').select('created_at').gte('created_at', sevenDaysAgo.toISOString())
    ]);

    const allDates = [
        ...(unifiedAnalytics.data || []),
        ...(legacyHotelAnalytics.data || []),
        ...(legacyFlightAnalytics.data || [])
    ];

    const now = new Date();
    const currentDay = now.getDay(); // 0 is Sunday, 1 is Monday...
    const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);

    const labels = ['M', 'T', 'W', 'TH', 'F'];
    const chartData: AnalyticsData[] = labels.map((label, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return {
            day: label,
            value: 0,
            displayValue: 0,
            type: d <= now ? 'actual' as const : 'projected' as const
        };
    });

    allDates.forEach(booking => {
        const date = new Date(booking.created_at);
        // Normalize date to compare with monday
        const bookingDate = new Date(date);
        bookingDate.setHours(0, 0, 0, 0);
        const dayDiff = Math.floor((bookingDate.getTime() - monday.getTime()) / (1000 * 60 * 60 * 24));
        if (dayDiff >= 0 && dayDiff < 5) {
            chartData[dayDiff].value += 1;
        }
    });

    const maxVal = Math.max(...chartData.map(d => d.value), 1);
    const analytics = chartData.map(d => ({
        ...d,
        displayValue: Math.round((d.value / maxVal) * 60) + 20 // Adjusted scale for 5 days
    }));

    // 3. Fetch Supplier Breakdown
    const [unifiedTypes, legacyHotelTypes, legacyFlightTypes] = await Promise.all([
        supabase.from('unified_bookings').select('type'),
        supabase.from('bookings').select('id'),
        supabase.from('flight_bookings').select('id')
    ]);

    const hotelCount = (unifiedTypes.data?.filter(b => b.type === 'hotel').length || 0) + (legacyHotelTypes.data?.length || 0);
    const flightCount = (unifiedTypes.data?.filter(b => b.type === 'flight').length || 0) + (legacyFlightTypes.data?.length || 0);
    const total = hotelCount + flightCount || 1;

    const supplierBreakdown: SupplierBreakdown[] = [
        { name: 'Hotels', value: Math.round((hotelCount / total) * 100), count: hotelCount, color: 'text-blue-600', bg: 'bg-blue-600' },
        { name: 'Flights', value: Math.round((flightCount / total) * 100), count: flightCount, color: 'text-blue-400', bg: 'bg-blue-400' },
        { name: 'Other', value: 0, count: 0, color: 'text-slate-400', bg: 'bg-slate-400' },
    ];

    // 4. Fetch Recent Activity
    const [unifiedRecent, legacyHotelRecent, legacyFlightRecent] = await Promise.all([
        supabase.from('unified_bookings').select('id, type, status, total_price, created_at, metadata').order('created_at', { ascending: false }).limit(5),
        supabase.from('bookings').select('id, property_name, status, total_price, created_at, holder_first_name, holder_last_name').order('created_at', { ascending: false }).limit(5),
        supabase.from('flight_bookings').select('id, provider, status, total_price, created_at, user_id').order('created_at', { ascending: false }).limit(5)
    ]);

    // Fetch flight passenger names
    const flightBookingIds = legacyFlightRecent.data?.map(b => b.id) || [];
    const { data: passengers } = await supabase
        .from('passengers')
        .select('booking_id, first_name, last_name')
        .in('booking_id', flightBookingIds);

    const passengerMap = (passengers || []).reduce((acc: Record<string, string>, p) => {
        if (!acc[p.booking_id]) {
            acc[p.booking_id] = `${p.first_name || ''} ${p.last_name || ''}`.trim();
        }
        return acc;
    }, {});

    const aggregatedActivity = [
        ...(unifiedRecent.data || []).map(item => {
            const meta = item.metadata as any;
            const name = meta?.passengers?.[0]
                ? `${meta.passengers[0].firstName} ${meta.passengers[0].lastName}`
                : meta?.holder
                    ? `${meta.holder.firstName} ${meta.holder.lastName}`
                    : 'Anonymous User';

            return {
                id: item.id,
                user: name.trim() || 'Anonymous User',
                action: `${item.status === 'cancelled' ? 'cancelled' : 'booked'} a ${item.type}`,
                time: new Date(item.created_at),
                amount: `${item.status === 'cancelled' ? '-' : ''}$${item.total_price}`,
                type: item.status === 'cancelled' ? 'cancel' : item.type
            };
        }),
        ...(legacyHotelRecent.data || []).map(item => ({
            id: item.id,
            user: `${item.holder_first_name || ''} ${item.holder_last_name || ''}`.trim() || 'Anonymous User',
            action: `booked hotel: ${item.property_name}`,
            time: new Date(item.created_at),
            amount: `${item.status === 'cancelled' ? '-' : ''}$${item.total_price}`,
            type: item.status === 'cancelled' ? 'cancel' : 'hotel'
        })),
        ...(legacyFlightRecent.data || []).map(item => ({
            id: item.id,
            user: passengerMap[item.id] || 'Anonymous User',
            action: `booked flight via ${item.provider}`,
            time: new Date(item.created_at),
            amount: `${item.status === 'cancelled' ? '-' : ''}$${item.total_price}`,
            type: item.status === 'cancelled' ? 'cancel' : 'flight'
        }))
    ]
        .sort((a, b) => b.time.getTime() - a.time.getTime())
        .slice(0, 5)
        .map(item => ({
            ...item,
            time: item.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }));

    // 5. Fetch Advanced Analytics (Trend, Funnel, Routes)
    const [
        unifiedTrendData,
        legacyHotelTrendData,
        legacyFlightTrendData,
        legacyFlightSegments,
        quotesCountRes
    ] = await Promise.all([
        supabase.from('unified_bookings').select('total_price, created_at, status, type, metadata, currency').in('status', ['confirmed', 'ticketed']),
        supabase.from('bookings').select('total_price, created_at, status, property_name, currency').in('status', ['confirmed', 'ticketed']),
        supabase.from('flight_bookings').select('id, total_price, created_at, status').in('status', ['booked', 'ticketed']),
        supabase.from('flight_segments').select('booking_id, destination'),
        supabase.from('booking_sessions').select('*', { count: 'exact', head: true })
    ]);

    const allConfirmed = [
        ...(unifiedTrendData.data || []).map((b: any) => ({
            price: Number(b.total_price) * (b.currency === 'USD' ? PHP_RATE : 1),
            date: b.created_at,
            destination: (b.metadata as any)?.destination || (b.metadata as any)?.city || (b.metadata as any)?.segments?.[0]?.arrival_airport || 'Unknown'
        })),
        ...(legacyHotelTrendData.data || []).map((b: any) => ({
            price: Number(b.total_price) * (b.currency === 'USD' ? PHP_RATE : 1),
            date: b.created_at,
            destination: b.property_name || 'Legacy Hotel'
        })),
        ...(legacyFlightTrendData.data || []).map((b: any) => {
            const segment = (legacyFlightSegments.data || []).find(s => s.booking_id === b.id);
            return {
                price: Number(b.total_price) * PHP_RATE,
                date: b.created_at,
                destination: segment?.destination || 'Legacy Flight'
            };
        })
    ];

    // Revenue Trend Line Calculation
    const getTrendData = (daysBack: number) => {
        const trendMap = new Map<string, number>();
        const now = new Date();
        for (let i = 0; i < daysBack; i++) {
            const d = new Date();
            d.setDate(now.getDate() - i);
            trendMap.set(d.toISOString().split('T')[0], 0);
        }

        allConfirmed.forEach(b => {
            const dateStr = new Date(b.date).toISOString().split('T')[0];
            if (trendMap.has(dateStr)) {
                trendMap.set(dateStr, (trendMap.get(dateStr) || 0) + b.price);
            }
        });

        return Array.from(trendMap.entries())
            .map(([date, revenue]) => ({ date, revenue }))
            .sort((a, b) => a.date.localeCompare(b.date));
    };

    // Top Routes Logic
    const routeMap = new Map<string, { count: number; revenue: number }>();
    allConfirmed.forEach(b => {
        const current = routeMap.get(b.destination) || { count: 0, revenue: 0 };
        routeMap.set(b.destination, {
            count: current.count + 1,
            revenue: current.revenue + b.price
        });
    });

    const topRoutes = Array.from(routeMap.entries())
        .map(([destination, metrics]) => ({ destination, ...metrics }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

    return {
        stats: {
            totalBookings,
            revenue: displayRevenue,
            pendingBookings,
            cancelledBookings
        },
        analytics,
        supplierBreakdown,
        recentActivity: aggregatedActivity,
        revenueTrend: {
            daily: getTrendData(7),
            weekly: getTrendData(14),
            monthly: getTrendData(30)
        },
        conversionFunnel: {
            // Estimate searches based on quotes if not logged
            searches: (quotesCountRes.count || 0) * 8,
            quotes: (quotesCountRes.count || 0),
            confirmed: allConfirmed.length
        },
        topRoutes
    };
}


export interface BookingsListParams {
    page?: number;
    pageSize?: number;
    searchTerm?: string;
    status?: string;
    supplier?: string;
    paymentStatus?: string;
    type?: string;
}

export interface PaginatedBookings {
    bookings: Booking[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export async function getBookingsList(params: BookingsListParams = {}): Promise<PaginatedBookings> {
    const {
        page = 1,
        pageSize = 10,
        searchTerm = '',
        status = 'all',
        supplier = 'all',
        paymentStatus = 'all',
        type = 'all'
    } = params;

    const supabase = createAdminClient();

    // 1. Build queries for each table
    const unifiedQuery = supabase.from('unified_bookings').select('*', { count: 'exact' });
    const legacyHotelQuery = supabase.from('bookings').select('*', { count: 'exact' });
    const legacyFlightQuery = supabase.from('flight_bookings').select('*', { count: 'exact' });

    // 2. Apply Type Filter
    if (type !== 'all') {
        if (type === 'flight') {
            legacyHotelQuery.eq('id', 'non-existent'); // effectively disable
            unifiedQuery.eq('type', 'flight');
        } else if (type === 'hotel') {
            legacyFlightQuery.eq('id', 'non-existent'); // effectively disable
            unifiedQuery.eq('type', 'hotel');
        }
    }

    // 3. Apply Status Filter
    if (status !== 'all') {
        unifiedQuery.eq('status', status);
        legacyHotelQuery.eq('status', status);
        // Handle flight status mapping if needed, legacy flight uses 'booked' instead of 'confirmed'
        const flightStatus = status === 'confirmed' ? 'booked' : status;
        legacyFlightQuery.eq('status', flightStatus);
    }

    // 4. Apply Supplier Filter
    if (supplier !== 'all') {
        if (supplier === 'legacy') {
            unifiedQuery.eq('id', 'non-existent');
        } else {
            unifiedQuery.eq('provider', supplier);
            legacyHotelQuery.eq('id', 'non-existent');
            legacyFlightQuery.eq('provider', supplier);
        }
    }

    // Execute queries
    const [unifiedRes, legacyHotelRes, legacyFlightRes] = await Promise.all([
        unifiedQuery.order('created_at', { ascending: false }),
        legacyHotelQuery.order('created_at', { ascending: false }),
        legacyFlightQuery.order('created_at', { ascending: false })
    ]);

    // Fetch passenger names and tickets for legacy flights
    const flightBookingIds = legacyFlightRes.data?.map(b => b.id) || [];
    const { data: passengers } = flightBookingIds.length > 0
        ? await supabase
            .from('passengers')
            .select('booking_id, first_name, last_name, ticket_number')
            .in('booking_id', flightBookingIds)
        : { data: [] };

    const passengerMap = (passengers || []).reduce((acc: Record<string, { name: string; tickets: string[] }>, p) => {
        if (!acc[p.booking_id]) {
            acc[p.booking_id] = { name: `${p.first_name || ''} ${p.last_name || ''}`.trim(), tickets: [] };
        }
        if (p.ticket_number) {
            acc[p.booking_id].tickets.push(p.ticket_number);
        }
        return acc;
    }, {});

    // 5. Merge and unify
    let allBookings: Booking[] = [
        ...(unifiedRes.data || []).map(item => {
            const meta = item.metadata as any;
            const name = meta?.passengers?.[0]
                ? `${meta.passengers[0].firstName} ${meta.passengers[0].lastName}`
                : meta?.holder
                    ? `${meta.holder.firstName} ${meta.holder.lastName}`
                    : 'Anonymous User';

            const tickets = meta?.tickets || (meta?.passengers?.map((p: any) => p.ticketNumber).filter(Boolean)) || [];
            const pnr = meta?.pnr || item.external_id || '';

            return {
                id: item.id,
                bookingRef: item.external_id || item.id.slice(0, 8).toUpperCase(),
                type: item.type as "flight" | "hotel",
                supplier: item.provider,
                customerName: name.trim() || 'Anonymous User',
                email: meta?.holder?.email || meta?.email || '',
                totalAmount: Number(item.total_price),
                currency: item.currency,
                status: item.status,
                paymentStatus: item.status === 'confirmed' || item.status === 'ticketed' ? 'paid' : 'unpaid',
                createdAt: item.created_at,
                ticketIds: Array.isArray(tickets) ? tickets : [tickets].filter(Boolean),
                ticketStatus: (item.status === 'ticketed' || tickets.length > 0) ? 'Issued' : 'N/A',
                pnr,
                paymentIntentId: meta?.payment_intent_id || meta?.paymentIntentId || ''
            };
        }),
        ...(legacyHotelRes.data || []).map(item => ({
            id: item.id,
            bookingRef: item.booking_id,
            type: 'hotel' as const,
            supplier: 'legacy',
            customerName: `${item.holder_first_name || ''} ${item.holder_last_name || ''}`.trim() || 'Anonymous User',
            email: item.holder_email || '',
            totalAmount: Number(item.total_price),
            currency: item.currency,
            status: item.status,
            paymentStatus: item.status === 'confirmed' ? 'paid' : 'unpaid',
            createdAt: item.created_at,
            ticketIds: [],
            ticketStatus: 'N/A',
            pnr: '',
            paymentIntentId: ''
        })),
        ...(legacyFlightRes.data || []).map(item => ({
            id: item.id,
            bookingRef: item.pnr,
            type: 'flight' as const,
            supplier: item.provider,
            customerName: passengerMap[item.id]?.name || 'Anonymous User',
            email: '',
            totalAmount: Number(item.total_price),
            currency: 'USD',
            status: item.status === 'booked' ? 'confirmed' : item.status,
            paymentStatus: item.status === 'booked' || item.status === 'ticketed' ? 'paid' : 'unpaid',
            createdAt: item.created_at,
            ticketIds: passengerMap[item.id]?.tickets || [],
            ticketStatus: (item.status === 'ticketed' || (passengerMap[item.id]?.tickets?.length > 0)) ? 'Issued' : 'Pending',
            pnr: item.pnr,
            paymentIntentId: ''
        }))
    ];

    // 6. Apply Search Filter (Server-side but after merge due to cross-table complexity)
    if (searchTerm) {
        const lowSearch = searchTerm.toLowerCase();
        allBookings = allBookings.filter(b =>
            b.customerName.toLowerCase().includes(lowSearch) ||
            b.bookingRef.toLowerCase().includes(lowSearch) ||
            b.pnr.toLowerCase().includes(lowSearch) ||
            b.email.toLowerCase().includes(lowSearch) ||
            b.paymentIntentId.toLowerCase().includes(lowSearch) ||
            b.supplier.toLowerCase().includes(lowSearch)
        );
    }

    // 7. Apply Payment Filter
    if (paymentStatus !== 'all') {
        allBookings = allBookings.filter(b => b.paymentStatus.toLowerCase() === paymentStatus.toLowerCase());
    }

    // 8. Final Sort and Paginate
    const total = allBookings.length;
    const sorted = allBookings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

    return {
        bookings: paginated,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
    };
}


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

        return {
            id: profile.id,
            name: displayName || 'Anonymous',
            email: profile.email,
            loyaltyTier,
            status: 'active',
            joined: profile.created_at,
            totalSpend,
            totalBookings,
            lastBooking: lastBookingDate ? lastBookingDate.toISOString() : 'N/A'
        };
    });
}

export async function getAdvancedAnalytics(): Promise<AdvancedAnalyticsData> {
    const supabase = createAdminClient();

    // 1. Provider Success Rates (Real data from unified_bookings)
    const { data: bookings } = await supabase
        .from('unified_bookings')
        .select('provider, status');

    const providers = ['mystifly', 'duffel', 'liteapi'];
    const providerSuccess = providers.map(p => {
        const pBookings = (bookings || []).filter(b => b.provider === p);
        return {
            name: p.charAt(0).toUpperCase() + p.slice(1),
            success: pBookings.filter(b => ['confirmed', 'ticketed'].includes(b.status)).length,
            failure: pBookings.filter(b => ['failed', 'cancelled'].includes(b.status)).length
        };
    });

    // 2. Ticketing Latency (Mocking logic based on created_at vs updated_at for ticketed bookings)
    const { data: ticketedBookings } = await supabase
        .from('unified_bookings')
        .select('created_at, updated_at')
        .eq('status', 'ticketed');

    const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const ticketingLatency = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));

        // Find bookings for this day and calculate avg latency
        const dayBookings = (ticketedBookings || []).filter(b => {
            const date = new Date(b.created_at);
            return date.toDateString() === d.toDateString();
        });

        const avgSeconds = dayBookings.length > 0
            ? dayBookings.reduce((acc, b) => {
                const diff = (new Date(b.updated_at).getTime() - new Date(b.created_at).getTime()) / 1000;
                return acc + Math.max(0, diff);
            }, 0) / dayBookings.length
            : 0;

        return {
            day: days[d.getDay()],
            avgSeconds: Math.round(avgSeconds)
        };
    });

    // 3. API Error Logs (Mocking since no explicit log table found, but following Edge Function pattern)
    // In a real scenario, we'd fetch from a 'logs' table or Supabase Management API
    const errorLogs = [
        {
            id: 'err-1',
            timestamp: new Date().toISOString(),
            functionName: 'mystifly-search',
            message: 'Network timeout: Mystifly API unresponsive',
            status: 504
        },
        {
            id: 'err-2',
            timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
            functionName: 'issue-ticket',
            message: 'Insufficient balance for ticketing',
            status: 400
        },
        {
            id: 'err-3',
            timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
            functionName: 'duffel-search',
            message: 'Invalid API Key provided',
            status: 401
        }
    ];

    return {
        providerSuccess,
        ticketingLatency,
        errorLogs
    };
}

export async function getNotifications(): Promise<Notification[]> {
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        console.error('Error fetching notifications:', error);
        return [];
    }

    return (data || []).map(n => ({
        id: n.id,
        title: n.title,
        description: n.description,
        type: n.type as 'booking' | 'system' | 'alert',
        read: n.read,
        created_at: n.created_at
    }));
}

export async function markNotificationAsRead(id: string): Promise<boolean> {
    const supabase = createAdminClient();
    const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', id);

    if (error) {
        console.error('Error marking notification as read:', error);
        return false;
    }
    return true;
}

export async function markAllNotificationsAsRead(): Promise<boolean> {
    const supabase = createAdminClient();
    const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('read', false);

    if (error) {
        console.error('Error marking all notifications as read:', error);
        return false;
    }
    return true;
}

// ============================================================================
// Booking Recovery Tools
// ============================================================================

type BookingTableName = 'unified_bookings' | 'bookings' | 'flight_bookings';

// Tables that have a metadata JSONB column
const TABLES_WITH_METADATA: BookingTableName[] = ['unified_bookings'];

// Tables that have an updated_at timestamp column
const TABLES_WITH_UPDATED_AT: BookingTableName[] = ['unified_bookings', 'bookings'];

// Tables that support the 'refunded' status directly in the DB
const TABLES_SUPPORTING_REFUNDED: BookingTableName[] = ['unified_bookings'];

/**
 * Helper: find a booking by ID across all three booking tables.
 * Returns the row data and the table it was found in.
 * Always uses select('*') to avoid column mismatch across different table schemas.
 */
async function findBookingAcrossTables(
    supabase: ReturnType<typeof createAdminClient>,
    bookingId: string,
): Promise<{ data: any; table: BookingTableName } | null> {
    // Try each table in order
    const tables: BookingTableName[] = ['unified_bookings', 'bookings', 'flight_bookings'];
    for (const table of tables) {
        const { data, error } = await supabase
            .from(table)
            .select('*')
            .eq('id', bookingId)
            .single();

        if (!error && data) {
            return { data, table };
        }
    }
    return null;
}

/**
 * Fetch full raw booking data for admin inspection.
 * Searches across unified_bookings, bookings, and flight_bookings.
 */
export async function getBookingRawData(bookingId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
        const supabase = createAdminClient();
        const result = await findBookingAcrossTables(supabase, bookingId);

        if (!result) {
            return { success: false, error: 'Booking not found in any table' };
        }

        // Return the full row from the specific table it was found in.
        // The UI will handle displaying either result.metadata (if present) or the whole row.
        return { success: true, data: result.data };
    } catch (err) {
        console.error('[getBookingRawData] Error:', err);
        return { success: false, error: err instanceof Error ? err.message : 'Unexpected error' };
    }
}

/**
 * Force a ticket status re-check via the Mystifly TripDetails API.
 * Only works for Mystifly flight bookings with a valid PNR.
 */
export async function adminForceStatusRecheck(bookingId: string): Promise<RecoveryActionResult> {
    try {
        const supabase = createAdminClient();

        // 1. Fetch the booking from any table
        const result = await findBookingAcrossTables(supabase, bookingId);

        if (!result) {
            return { success: false, message: 'Booking not found' };
        }

        const { data: booking, table: sourceTable } = result;

        if (booking.provider !== 'mystifly') {
            return { success: false, message: `Status recheck is only supported for Mystifly bookings. This booking uses "${booking.provider}".` };
        }

        const metadata = booking.metadata as Record<string, unknown>;
        const pnr = (metadata?.pnr as string) || booking.external_id || booking.pnr;

        if (!pnr) {
            return { success: false, message: 'No PNR found for this booking. Cannot query Mystifly.' };
        }

        // 2. Create a Mystifly session
        const MYSTIFLY_BASE_URL = process.env.MYSTIFLY_BASE_URL || 'https://restapidemo.myfarebox.com';
        const sessionRes = await fetch(`${MYSTIFLY_BASE_URL}/api/CreateSession`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                UserName: process.env.MYSTIFLY_USERNAME || '',
                Password: process.env.MYSTIFLY_PASSWORD || '',
                AccountNumber: process.env.MYSTIFLY_ACCOUNT_NUMBER || '',
            }),
        });

        if (!sessionRes.ok) {
            return { success: false, message: `Mystifly session creation failed (HTTP ${sessionRes.status})` };
        }

        const sessionData = await sessionRes.json();
        if (!sessionData.Success || !sessionData.Data?.SessionId) {
            return { success: false, message: `Mystifly session failed: ${sessionData.Message || 'Unknown error'}` };
        }

        const sessionId = sessionData.Data.SessionId;

        // 3. Call TripDetails to get current status
        const tripRes = await fetch(`${MYSTIFLY_BASE_URL}/api/v1/TripDetails/Flight`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionId}`,
            },
            body: JSON.stringify({
                UniqueID: pnr,
            }),
        });

        if (!tripRes.ok) {
            const text = await tripRes.text();
            return { success: false, message: `Mystifly TripDetails HTTP error: ${tripRes.status} ${text}` };
        }

        const tripData = await tripRes.json();

        if (!tripData.Success) {
            return {
                success: false,
                message: `Mystifly TripDetails failed: ${tripData.Message || 'Unknown error'}`,
                data: tripData,
            };
        }

        // 4. Extract ticket info from the response
        const tripInfo = tripData.Data || {};
        const ticketNumbers: string[] = [];
        let newStatus = booking.status;

        // Parse passengers for ticket numbers
        const travelers = tripInfo.TravelItinerary?.ItineraryInfo?.ReservationItems ||
            tripInfo.TravelItinerary?.ItineraryInfo?.Passengers || [];

        if (Array.isArray(travelers)) {
            for (const traveler of travelers) {
                const eTicket = traveler.ETicketNumber || traveler.TicketNumber;
                if (eTicket) ticketNumbers.push(eTicket);
            }
        }

        // Determine new status based on ticket presence
        if (ticketNumbers.length > 0) {
            newStatus = 'ticketed';
        } else if (tripInfo.TravelItinerary?.ItineraryInfo?.ItineraryStatus === 'Cancelled') {
            newStatus = 'cancelled';
        }

        // 5. Update the booking in the same table it was found in
        const hasMetadata = TABLES_WITH_METADATA.includes(sourceTable);
        const hasUpdatedAt = TABLES_WITH_UPDATED_AT.includes(sourceTable);

        const updatePayload: Record<string, any> = {
            status: newStatus,
        };

        if (hasUpdatedAt) {
            updatePayload.updated_at = new Date().toISOString();
        }

        if (hasMetadata) {
            updatePayload.metadata = {
                ...(booking.metadata as object || {}),
                lastStatusRecheck: new Date().toISOString(),
                _mystiflyTripDetails: tripInfo,
                ...(ticketNumbers.length > 0 ? { ticketNumbers, tickets: ticketNumbers } : {}),
            };
        }

        await supabase
            .from(sourceTable)
            .update(updatePayload)
            .eq('id', bookingId);

        return {
            success: true,
            message: ticketNumbers.length > 0
                ? `Status updated to "${newStatus}". Found ${ticketNumbers.length} ticket(s): ${ticketNumbers.join(', ')}`
                : `Status recheck completed. Current status: "${newStatus}". No tickets found yet.`,
            newStatus,
            data: { ticketNumbers, tripInfo },
        };
    } catch (err) {
        console.error('[adminForceStatusRecheck] Error:', err);
        return { success: false, message: err instanceof Error ? err.message : 'Unexpected error during status recheck' };
    }
}

/**
 * Admin force-cancel a booking. Searches across all booking tables.
 */
export async function adminCancelBooking(bookingId: string): Promise<RecoveryActionResult> {
    try {
        const supabase = createAdminClient();

        const result = await findBookingAcrossTables(supabase, bookingId);

        if (!result) {
            return { success: false, message: 'Booking not found' };
        }

        const { data: booking, table: sourceTable } = result;

        if (booking.status === 'cancelled') {
            return { success: false, message: 'Booking is already cancelled' };
        }

        const now = new Date().toISOString();
        const hasMetadata = TABLES_WITH_METADATA.includes(sourceTable);
        const hasUpdatedAt = TABLES_WITH_UPDATED_AT.includes(sourceTable);

        const updatedMetadata = hasMetadata ? {
            ...(booking.metadata as object || {}),
            cancelledAt: now,
            cancelledBy: 'admin',
            previousStatus: booking.status,
        } : undefined;

        const updatePayload: Record<string, any> = {
            status: 'cancelled',
        };
        if (hasUpdatedAt) updatePayload.updated_at = now;
        if (updatedMetadata) updatePayload.metadata = updatedMetadata;

        const { error: updateError } = await supabase
            .from(sourceTable)
            .update(updatePayload)
            .eq('id', bookingId);

        if (updateError) {
            return { success: false, message: `Failed to update: ${updateError.message}` };
        }

        return {
            success: true,
            message: `Booking cancelled successfully (was "${booking.status}", table: ${sourceTable})`,
            newStatus: 'cancelled',
        };
    } catch (err) {
        console.error('[adminCancelBooking] Error:', err);
        return { success: false, message: err instanceof Error ? err.message : 'Unexpected error' };
    }
}

/**
 * Admin force-refund a booking. Searches across all booking tables.
 * Note: Actual payment refund must be done manually via Stripe/provider dashboard.
 */
export async function adminForceRefund(bookingId: string): Promise<RecoveryActionResult> {
    try {
        const supabase = createAdminClient();

        const result = await findBookingAcrossTables(supabase, bookingId);

        if (!result) {
            return { success: false, message: 'Booking not found' };
        }

        const { data: booking, table: sourceTable } = result;

        if (booking.status === 'refunded') {
            return { success: false, message: 'Booking is already marked as refunded' };
        }

        const now = new Date().toISOString();
        const hasMetadata = TABLES_WITH_METADATA.includes(sourceTable);
        const hasUpdatedAt = TABLES_WITH_UPDATED_AT.includes(sourceTable);
        const supportsRefunded = TABLES_SUPPORTING_REFUNDED.includes(sourceTable);

        const updatedMetadata = hasMetadata ? {
            ...(booking.metadata as object || {}),
            refundedAt: now,
            refundedBy: 'admin',
            previousStatus: booking.status,
        } : undefined;

        // Use 'refunded' if supported, otherwise stay in 'cancelled' (or move to it)
        // Note: For legacy tables, we can't store 'refunded' so we keep 'cancelled'.
        const targetStatus = supportsRefunded ? 'refunded' : 'cancelled';

        const updatePayload: Record<string, any> = {
            status: targetStatus,
        };
        if (hasUpdatedAt) updatePayload.updated_at = now;
        if (updatedMetadata) updatePayload.metadata = updatedMetadata;

        const { error: updateError } = await supabase
            .from(sourceTable)
            .update(updatePayload)
            .eq('id', bookingId);

        if (updateError) {
            return { success: false, message: `Failed to update: ${updateError.message}` };
        }

        return {
            success: true,
            message: `Booking marked as refunded (was "${booking.status}", table: ${sourceTable}). Remember to process the actual payment refund via the provider dashboard.`,
            newStatus: 'refunded',
        };
    } catch (err) {
        console.error('[adminForceRefund] Error:', err);
        return { success: false, message: err instanceof Error ? err.message : 'Unexpected error' };
    }
}

/**
 * Admin restore a booking from a terminal state (cancelled / refunded / failed)
 * back to its previous status using metadata.previousStatus.
 */
export async function adminRestoreBooking(bookingId: string): Promise<RecoveryActionResult> {
    try {
        const supabase = createAdminClient();

        const result = await findBookingAcrossTables(supabase, bookingId);

        if (!result) {
            return { success: false, message: 'Booking not found' };
        }

        const { data: booking, table: sourceTable } = result;

        const terminalStatuses = ['cancelled', 'refunded', 'failed'];
        if (!terminalStatuses.includes(booking.status)) {
            return { success: false, message: `Booking is not in a terminal state (current: "${booking.status}")` };
        }

        const meta = booking.metadata as Record<string, unknown> | null;

        // Determine recovery status fallback based on table constraints
        let fallbackConfirmed = 'confirmed';
        if (sourceTable === 'flight_bookings') fallbackConfirmed = 'booked';

        const previousStatus = (meta?.previousStatus as string) || fallbackConfirmed;

        const now = new Date().toISOString();
        const hasMetadata = TABLES_WITH_METADATA.includes(sourceTable);
        const hasUpdatedAt = TABLES_WITH_UPDATED_AT.includes(sourceTable);

        const updatedMetadata = hasMetadata ? {
            ...(meta as object),
            restoredAt: now,
            restoredBy: 'admin',
            restoredFrom: booking.status,
        } : undefined;

        const updatePayload: Record<string, any> = {
            status: previousStatus,
        };
        if (hasUpdatedAt) updatePayload.updated_at = now;
        if (updatedMetadata) updatePayload.metadata = updatedMetadata;

        const { error: updateError } = await supabase
            .from(sourceTable)
            .update(updatePayload)
            .eq('id', bookingId);

        if (updateError) {
            return { success: false, message: `Failed to update: ${updateError.message}` };
        }

        return {
            success: true,
            message: `Booking restored from "${booking.status}" → "${previousStatus}" (table: ${sourceTable})`,
            newStatus: previousStatus,
        };
    } catch (err) {
        console.error('[adminRestoreBooking] Error:', err);
        return { success: false, message: err instanceof Error ? err.message : 'Unexpected error' };
    }
}
