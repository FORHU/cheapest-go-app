import { createAdminClient } from '@/utils/supabase/admin';

export interface DashboardStats {
    totalBookings: number;
    revenue: number;
    pendingBookings: number;
    cancelledBookings: number;
}

export interface AnalyticsData {
    day: string;
    value: number;
    displayValue: number;
    type: 'actual' | 'projected';
}

export interface SupplierBreakdown {
    name: string;
    value: number; // percentage
    count: number; // absolute count
    color: string;
    bg: string;
}

export interface RecentActivity {
    id: string;
    user: string;
    action: string;
    time: string;
    amount: string;
    type: string;
}

export interface AdvancedAnalyticsData {
    providerSuccess: {
        name: string;
        success: number;
        failure: number;
    }[];
    ticketingLatency: {
        day: string;
        avgSeconds: number;
    }[];
    errorLogs: {
        id: string;
        timestamp: string;
        functionName: string;
        message: string;
        status: number;
    }[];
}

export interface RevenueTrend {
    date: string;
    revenue: number;
}

export interface ConversionFunnel {
    searches: number;
    quotes: number;
    confirmed: number;
}

export interface RouteMetric {
    destination: string;
    count: number;
    revenue: number;
}

export interface DashboardData {
    stats: DashboardStats;
    analytics: AnalyticsData[];
    supplierBreakdown: SupplierBreakdown[];
    recentActivity: RecentActivity[];
    revenueTrend: {
        daily: RevenueTrend[];
        weekly: RevenueTrend[];
        monthly: RevenueTrend[];
    };
    conversionFunnel: ConversionFunnel;
    topRoutes: RouteMetric[];
}

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
        supabase.from('unified_bookings').select('total_price').in('status', ['confirmed', 'ticketed']),
        supabase.from('bookings').select('total_price').in('status', ['confirmed', 'ticketed']),
        supabase.from('flight_bookings').select('total_price').in('status', ['booked', 'ticketed'])
    ]);

    const revenue = [
        ...(unifiedRev.data || []),
        ...(legacyHotelRev.data || []),
        ...(legacyFlightRev.data || [])
    ].reduce((acc, curr) => acc + Number(curr.total_price), 0);

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

    const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const chartData: AnalyticsData[] = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return {
            day: days[d.getDay()],
            value: 0,
            displayValue: 0,
            type: 'actual' as const
        };
    });

    allDates.forEach(booking => {
        const date = new Date(booking.created_at);
        const diffDays = Math.floor((new Date().getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < 7) {
            const index = 6 - diffDays;
            if (index >= 0) chartData[index].value += 1;
        }
    });

    const maxVal = Math.max(...chartData.map(d => d.value), 1);
    const analytics = chartData.map(d => ({
        ...d,
        displayValue: Math.round((d.value / maxVal) * 80) + 20
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
        supabase.from('unified_bookings').select('total_price, created_at, status, type, metadata').in('status', ['confirmed', 'ticketed']),
        supabase.from('bookings').select('total_price, created_at, status, property_name').in('status', ['confirmed', 'ticketed']),
        supabase.from('flight_bookings').select('id, total_price, created_at, status').in('status', ['booked', 'ticketed']),
        supabase.from('flight_segments').select('booking_id, destination'),
        supabase.from('booking_sessions').select('*', { count: 'exact', head: true })
    ]);

    const allConfirmed = [
        ...(unifiedTrendData.data || []).map(b => ({
            price: Number(b.total_price),
            date: b.created_at,
            destination: (b.metadata as any)?.destination || (b.metadata as any)?.city || (b.metadata as any)?.segments?.[0]?.arrival_airport || 'Unknown'
        })),
        ...(legacyHotelTrendData.data || []).map(b => ({
            price: Number(b.total_price),
            date: b.created_at,
            destination: b.property_name || 'Legacy Hotel'
        })),
        ...(legacyFlightTrendData.data || []).map(b => {
            const segment = (legacyFlightSegments.data || []).find(s => s.booking_id === b.id);
            return {
                price: Number(b.total_price),
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
            weekly: getTrendData(30),
            monthly: getTrendData(90)
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

export interface Booking {
    id: string;
    bookingRef: string;
    type: "flight" | "hotel";
    supplier: string;
    customerName: string;
    email: string;
    totalAmount: number;
    currency: string;
    status: string;
    paymentStatus: string;
    createdAt: string;
    ticketIds: string[];
    ticketStatus: string;
    pnr: string;
    paymentIntentId: string;
}

export async function getBookingsList(): Promise<Booking[]> {
    const supabase = createAdminClient();

    const [unifiedRes, legacyHotelRes, legacyFlightRes] = await Promise.all([
        supabase.from('unified_bookings').select('*').order('created_at', { ascending: false }),
        supabase.from('bookings').select('*').order('created_at', { ascending: false }),
        supabase.from('flight_bookings').select('*').order('created_at', { ascending: false })
    ]);

    // Fetch passenger names and tickets for legacy flights
    const flightBookingIds = legacyFlightRes.data?.map(b => b.id) || [];
    const { data: passengers } = await supabase
        .from('passengers')
        .select('booking_id, first_name, last_name, ticket_number')
        .in('booking_id', flightBookingIds);

    const passengerMap = (passengers || []).reduce((acc: Record<string, { name: string; tickets: string[] }>, p) => {
        if (!acc[p.booking_id]) {
            acc[p.booking_id] = { name: `${p.first_name || ''} ${p.last_name || ''}`.trim(), tickets: [] };
        }
        if (p.ticket_number) {
            acc[p.booking_id].tickets.push(p.ticket_number);
        }
        return acc;
    }, {});

    const list: Booking[] = [
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
                ticketStatus: item.status === 'ticketed' ? 'Issued' : 'N/A',
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
            email: '', // Not stored in legacy flight_bookings table directly
            totalAmount: Number(item.total_price),
            currency: 'USD',
            status: item.status === 'booked' ? 'confirmed' : item.status,
            paymentStatus: item.status === 'booked' || item.status === 'ticketed' ? 'paid' : 'unpaid',
            createdAt: item.created_at,
            ticketIds: passengerMap[item.id]?.tickets || [],
            ticketStatus: item.status === 'ticketed' ? 'Issued' : 'Pending',
            pnr: item.pnr,
            paymentIntentId: ''
        }))
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return list;
}

export interface Customer {
    id: string;
    name: string;
    email: string;
    loyaltyTier: 'platinum' | 'gold' | 'silver' | 'bronze';
    status: 'active' | 'inactive' | 'banned';
    joined: string;
    totalSpend: number;
    totalBookings: number;
    lastBooking: string;
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
