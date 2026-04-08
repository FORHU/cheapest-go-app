import { createAdminClient } from '@/utils/supabase/admin';
import { EXCHANGE_RATES } from '@/lib/currency';
import { DashboardStats, AnalyticsData, SupplierBreakdown, RecentActivity, AdvancedAnalyticsData, RevenueTrend, ConversionFunnel, RouteMetric, DashboardData, ApiLogRow } from '@/types/admin';
import { getProviderIntegrations } from './providers';
import { getAdminSettings } from './settings';

export async function getDashboardData(): Promise<DashboardData> {
    const supabase = createAdminClient();

    // Fire provider integrations + admin settings early (concurrent with DB queries)
    const providerIntegrationsPromise = getProviderIntegrations();
    const adminSettingsPromise = getAdminSettings();

    // 1. Fetch Stats from all tables
    const [unifiedRes, legacyHotelRes, legacyFlightRes] = await Promise.all([
        supabase.from('unified_bookings').select('*', { count: 'exact' }),
        supabase.from('bookings').select('*', { count: 'exact' }),
        supabase.from('flight_bookings').select('*', { count: 'exact' })
    ]);

    const totalBookings = (unifiedRes.count || 0) + (legacyHotelRes.count || 0) + (legacyFlightRes.count || 0);

    // Revenue Calculation (Confirmed/Ticketed)
    const [unifiedRev, legacyHotelRev, legacyFlightRev] = await Promise.all([
        supabase.from('unified_bookings').select('total_price, supplier_cost, markup_amount, profit, currency').in('status', ['confirmed', 'ticketed']),
        supabase.from('bookings').select('total_price, currency').in('status', ['confirmed', 'ticketed']),
        supabase.from('flight_bookings').select('total_price').in('status', ['booked', 'ticketed'])
    ]);

    const PHP_RATE = 1 / EXCHANGE_RATES['PHP']; // ~55.56 — computed from shared exchange rates

    // Gather all bookings for revenue calculations
    const allBookingsForRevenue = [
        ...(unifiedRes.data || []).map(b => ({ ...b, source: 'unified', provider: b.provider || 'unknown' })),
        ...(legacyHotelRes.data || []).map(b => ({ ...b, source: 'legacy_hotel', provider: 'legacy_hotel' })),
        ...(legacyFlightRes.data || []).map(b => ({ ...b, source: 'legacy_flight', provider: b.provider || 'unknown' }))
    ];

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
        supabase.from('unified_bookings').select('*', { count: 'exact', head: true }).in('status', ['cancelled', 'refunded']),
        supabase.from('bookings').select('*', { count: 'exact', head: true }).in('status', ['cancelled', 'refunded']),
        supabase.from('flight_bookings').select('*', { count: 'exact', head: true }).in('status', ['cancelled', 'refunded'])
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

            const isNeg = item.status === 'cancelled' || item.status === 'refunded';
            return {
                id: item.id,
                user: name.trim() || 'Anonymous User',
                action: `${item.status === 'cancelled' ? 'cancelled' : item.status === 'refunded' ? 'refunded' : 'booked'} a ${item.type}`,
                time: new Date(item.created_at),
                amount: `${isNeg ? '-' : ''}$${item.total_price}`,
                type: isNeg ? 'cancel' : item.type
            };
        }),
        ...(legacyHotelRecent.data || []).map(item => {
            const isNeg = item.status === 'cancelled' || item.status === 'refunded';
            return {
                id: item.id,
                user: `${item.holder_first_name || ''} ${item.holder_last_name || ''}`.trim() || 'Anonymous User',
                action: `${isNeg ? item.status : 'booked'} hotel: ${item.property_name}`,
                time: new Date(item.created_at),
                amount: `${isNeg ? '-' : ''}$${item.total_price}`,
                type: isNeg ? 'cancel' : 'hotel'
            };
        }),
        ...(legacyFlightRecent.data || []).map(item => {
            const isNeg = item.status === 'cancelled' || item.status === 'refunded';
            return {
                id: item.id,
                user: passengerMap[item.id] || 'Anonymous User',
                action: `${isNeg ? item.status : 'booked'} flight via ${item.provider}`,
                time: new Date(item.created_at),
                amount: `${isNeg ? '-' : ''}$${item.total_price}`,
                type: isNeg ? 'cancel' : 'flight'
            };
        })
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
        quotesCountRes,
        searchesCountRes
    ] = await Promise.all([
        supabase.from('unified_bookings').select('total_price, created_at, status, type, metadata, currency').in('status', ['confirmed', 'ticketed']),
        supabase.from('bookings').select('total_price, created_at, status, property_name, currency').in('status', ['confirmed', 'ticketed']),
        supabase.from('flight_bookings').select('id, total_price, created_at, status').in('status', ['booked', 'ticketed']),
        supabase.from('flight_segments').select('booking_id, destination'),
        supabase.from('booking_sessions').select('*', { count: 'exact', head: true }),
        supabase.from('flight_searches').select('*', { count: 'exact', head: true })
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

    // 6. Revenue & Performance Stats (New)
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    let dailyRevenue = 0;
    let monthlyRevenue = 0;
    let totalMarkup = 0;
    let totalProfit = 0;
    const providerMap = new Map<string, number>();
    const providerProfitMap = new Map<string, number>();

    let totalCount = allBookingsForRevenue.length || 1;
    let refundCount = 0;
    let failedCount = 0;
    let pendingCount = 0;

    allBookingsForRevenue.forEach(b => {
        const isConfirmed = b.status === 'confirmed' || b.status === 'ticketed' || b.status === 'booked';
        const isRefunded = b.status === 'refunded';
        const isFailed = b.status === 'failed' || b.status === 'cancelled';
        const isPending = b.status === 'pending' || b.status === 'awaiting_ticket' || b.status === 'cancel_requested';

        if (isRefunded) refundCount++;
        if (isFailed) failedCount++;
        if (isPending) pendingCount++;

        if (isConfirmed) {
            const price = Number(b.total_price) * (b.currency === 'USD' ? PHP_RATE : 1);
            const profitValue = Number(b.profit || 0) * (b.currency === 'USD' ? PHP_RATE : 1);
            const bookingTime = new Date(b.created_at).getTime();

            if (bookingTime >= startOfDay) dailyRevenue += price;
            if (bookingTime >= startOfMonth) monthlyRevenue += price;

            totalMarkup += Number(b.markup_amount || 0) * (b.currency === 'USD' ? PHP_RATE : 1);
            totalProfit += profitValue;

            providerMap.set(b.provider, (providerMap.get(b.provider) || 0) + price);
            providerProfitMap.set(b.provider, (providerProfitMap.get(b.provider) || 0) + profitValue);
        }
    });

    const revenueByProvider = Array.from(providerMap.entries())
        .map(([provider, amount]) => ({ provider, amount }))
        .sort((a, b) => b.amount - a.amount);


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
        revenueStats: {
            dailyRevenue: Math.round(dailyRevenue),
            monthlyRevenue: Math.round(monthlyRevenue),
            revenueByProvider,
            totalMarkup: Math.round(totalMarkup),
            totalProfit: Math.round(totalProfit),
            refundRate: Math.round((refundCount / totalCount) * 100),
            failedRate: Math.round((failedCount / totalCount) * 100),
            pendingRate: Math.round((pendingCount / totalCount) * 100)
        },
        conversionFunnel: {
            searches: searchesCountRes.count || 0,
            quotes: quotesCountRes.count || 0,
            confirmed: allConfirmed.length
        },
        topRoutes,
        providerIntegrations: await providerIntegrationsPromise,
        defaultCurrency: ((await adminSettingsPromise).default_currency as string) || 'USD',
    };
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

    // 3. API Error Logs (from api_logs table)
    const { data: apiErrors } = await supabase
        .from('api_logs')
        .select('id, created_at, provider, endpoint, error_message, response_status')
        .not('error_message', 'is', null)
        .order('created_at', { ascending: false })
        .limit(10);

    const errorLogs = (apiErrors || []).map(log => ({
        id: log.id,
        timestamp: log.created_at,
        functionName: `${log.provider}/${log.endpoint}`,
        message: log.error_message,
        status: log.response_status || 500
    }));

    return {
        providerSuccess,
        ticketingLatency,
        errorLogs
    };
}

/**
 * Fetch all recent API logs for the debug console.
 */
export async function getApiLogs(): Promise<ApiLogRow[]> {
    const supabase = createAdminClient();

    const { data, error } = await supabase
        .from('api_logs')
        .select('id, provider, endpoint, method, request_params, response_status, response_summary, duration_ms, error_message, user_id, search_id, created_at')
        .order('created_at', { ascending: false })
        .limit(100);

    if (error) {
        console.error('[getApiLogs] Error:', error.message);
        return [];
    }

    return (data || []) as ApiLogRow[];
}