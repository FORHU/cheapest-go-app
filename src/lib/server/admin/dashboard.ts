import { createAdminClient } from '@/utils/supabase/admin';
import { EXCHANGE_RATES } from '@/lib/currency';
import { DashboardStats, AnalyticsData, SupplierBreakdown, RecentActivity, AdvancedAnalyticsData, RevenueTrend, ConversionFunnel, RouteMetric, DashboardData, ApiLogRow } from '@/types/admin';
import { getProviderIntegrations } from './providers';
import { getAdminSettings } from './settings';

// ─── Revenue RPC helper ────────────────────────────────────────────────────
// Runs aggregation in Postgres — never hits JS-side row limits.
// Both the dashboard and revenue page call this so they always match.
async function fetchRevenueStats(supabase: ReturnType<typeof createAdminClient>) {
    const phpRate = 1 / EXCHANGE_RATES['PHP']; // e.g. 55.556
    const { data, error } = await supabase.rpc('get_revenue_stats', { php_rate: phpRate });
    if (error) {
        console.error('[fetchRevenueStats] RPC error:', error.message);
        return null;
    }
    return data as {
        totalRevenue: number;
        confirmedCount: number;
        totalMarkup: number;
        totalProfit: number;
        dailyRevenue: number;
        monthlyRevenue: number;
        revenueByCurrency: Record<string, number>;
    };
}

export async function getDashboardData(): Promise<DashboardData> {
    const supabase = createAdminClient();
    const PHP_RATE = 1 / EXCHANGE_RATES['PHP'];

    // Fire these concurrently — none depend on each other
    const providerIntegrationsPromise = getProviderIntegrations();
    const adminSettingsPromise = getAdminSettings();

    // ── 1. Booking counts (head: true = count only, no row data returned) ───
    const [
        unifiedTotal, hotelTotal, flightTotal,
        unifiedPending, hotelPending, flightPending,
        unifiedCancelled, hotelCancelled, flightCancelled,
        revenueStats
    ] = await Promise.all([
        supabase.from('unified_bookings').select('*', { count: 'exact', head: true }),
        supabase.from('bookings').select('*', { count: 'exact', head: true }),
        supabase.from('flight_bookings').select('*', { count: 'exact', head: true }),

        supabase.from('unified_bookings').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('flight_bookings').select('*', { count: 'exact', head: true }).eq('status', 'pending'),

        supabase.from('unified_bookings').select('*', { count: 'exact', head: true }).in('status', ['cancelled', 'refunded']),
        supabase.from('bookings').select('*', { count: 'exact', head: true }).in('status', ['cancelled', 'refunded']),
        supabase.from('flight_bookings').select('*', { count: 'exact', head: true }).in('status', ['cancelled', 'refunded']),

        // ── RPC: single source of truth for all revenue figures ───────────────
        fetchRevenueStats(supabase),
    ]);

    const totalBookings    = (unifiedTotal.count    || 0) + (hotelTotal.count    || 0) + (flightTotal.count    || 0);
    const pendingBookings  = (unifiedPending.count  || 0) + (hotelPending.count  || 0) + (flightPending.count  || 0);
    const cancelledBookings = (unifiedCancelled.count || 0) + (hotelCancelled.count || 0) + (flightCancelled.count || 0);

    // Revenue comes entirely from the RPC now — no JS-side row fetching
    const displayRevenue = Math.floor(revenueStats?.totalRevenue ?? 0);

    // ── 2. Weekly analytics chart (bookings per day, Mon–Fri) ────────────────
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [unifiedAnalytics, hotelAnalytics, flightAnalytics] = await Promise.all([
        supabase.from('unified_bookings').select('created_at').gte('created_at', sevenDaysAgo.toISOString()),
        supabase.from('bookings').select('created_at').gte('created_at', sevenDaysAgo.toISOString()),
        supabase.from('flight_bookings').select('created_at').gte('created_at', sevenDaysAgo.toISOString()),
    ]);

    const allDates = [
        ...(unifiedAnalytics.data || []),
        ...(hotelAnalytics.data   || []),
        ...(flightAnalytics.data  || []),
    ];

    const now = new Date();
    const diffToMonday = now.getDay() === 0 ? -6 : 1 - now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);

    const labels = ['M', 'T', 'W', 'TH', 'F'];
    const chartData: AnalyticsData[] = labels.map((label, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return { day: label, value: 0, displayValue: 0, type: d <= now ? 'actual' as const : 'projected' as const };
    });

    allDates.forEach(booking => {
        const bookingDate = new Date(booking.created_at);
        bookingDate.setHours(0, 0, 0, 0);
        const dayDiff = Math.floor((bookingDate.getTime() - monday.getTime()) / (1000 * 60 * 60 * 24));
        if (dayDiff >= 0 && dayDiff < 5) chartData[dayDiff].value += 1;
    });

    const maxVal = Math.max(...chartData.map(d => d.value), 1);
    const analytics = chartData.map(d => ({
        ...d,
        displayValue: Math.round((d.value / maxVal) * 60) + 20,
    }));

    // ── 3. Supplier breakdown ─────────────────────────────────────────────────
    const [unifiedTypes, legacyHotels, legacyFlights] = await Promise.all([
        supabase.from('unified_bookings').select('type'),
        supabase.from('bookings').select('id'),
        supabase.from('flight_bookings').select('id'),
    ]);

    const hotelCount  = (unifiedTypes.data?.filter(b => b.type === 'hotel').length || 0) + (legacyHotels.data?.length || 0);
    const flightCount = (unifiedTypes.data?.filter(b => b.type === 'flight').length || 0) + (legacyFlights.data?.length || 0);
    const typeTotal   = hotelCount + flightCount || 1;

    const supplierBreakdown: SupplierBreakdown[] = [
        { name: 'Hotels',  value: Math.round((hotelCount  / typeTotal) * 100), count: hotelCount,  color: 'text-blue-600',  bg: 'bg-blue-600'  },
        { name: 'Flights', value: Math.round((flightCount / typeTotal) * 100), count: flightCount, color: 'text-blue-400',  bg: 'bg-blue-400'  },
        { name: 'Other',   value: 0, count: 0,                                                     color: 'text-slate-400', bg: 'bg-slate-400' },
    ];

    // ── 4. Recent activity (last 5 across all tables) ─────────────────────────
    const [unifiedRecent, hotelRecent, flightRecent] = await Promise.all([
        supabase.from('unified_bookings').select('id, type, status, total_price, created_at, metadata').order('created_at', { ascending: false }).limit(5),
        supabase.from('bookings').select('id, property_name, status, total_price, created_at, holder_first_name, holder_last_name').order('created_at', { ascending: false }).limit(5),
        supabase.from('flight_bookings').select('id, provider, status, total_price, created_at, user_id').order('created_at', { ascending: false }).limit(5),
    ]);

    const flightBookingIds = flightRecent.data?.map(b => b.id) || [];
    const { data: passengers } = flightBookingIds.length > 0
        ? await supabase.from('passengers').select('booking_id, first_name, last_name').in('booking_id', flightBookingIds)
        : { data: [] };

    const passengerMap = (passengers || []).reduce((acc: Record<string, string>, p) => {
        if (!acc[p.booking_id]) acc[p.booking_id] = `${p.first_name || ''} ${p.last_name || ''}`.trim();
        return acc;
    }, {});

    const aggregatedActivity = [
        ...(unifiedRecent.data || []).map(item => {
            const meta = item.metadata as any;
            const name = meta?.passengers?.[0]
                ? `${meta.passengers[0].firstName} ${meta.passengers[0].lastName}`
                : meta?.holder ? `${meta.holder.firstName} ${meta.holder.lastName}` : 'Anonymous User';
            const isNeg = item.status === 'cancelled' || item.status === 'refunded';
            return {
                id: item.id,
                user: name.trim() || 'Anonymous User',
                action: `${isNeg ? item.status : 'booked'} a ${item.type}`,
                time: new Date(item.created_at),
                amount: `${isNeg ? '-' : ''}$${item.total_price}`,
                type: isNeg ? 'cancel' : item.type,
            };
        }),
        ...(hotelRecent.data || []).map(item => {
            const isNeg = item.status === 'cancelled' || item.status === 'refunded';
            return {
                id: item.id,
                user: `${item.holder_first_name || ''} ${item.holder_last_name || ''}`.trim() || 'Anonymous User',
                action: `${isNeg ? item.status : 'booked'} hotel: ${item.property_name}`,
                time: new Date(item.created_at),
                amount: `${isNeg ? '-' : ''}$${item.total_price}`,
                type: isNeg ? 'cancel' : 'hotel',
            };
        }),
        ...(flightRecent.data || []).map(item => {
            const isNeg = item.status === 'cancelled' || item.status === 'refunded';
            return {
                id: item.id,
                user: passengerMap[item.id] || 'Anonymous User',
                action: `${isNeg ? item.status : 'booked'} flight via ${item.provider}`,
                time: new Date(item.created_at),
                amount: `${isNeg ? '-' : ''}$${item.total_price}`,
                type: isNeg ? 'cancel' : 'flight',
            };
        }),
    ]
        .sort((a, b) => b.time.getTime() - a.time.getTime())
        .slice(0, 5)
        .map(item => ({ ...item, time: item.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }));

    // ── 5. Revenue trend + top routes ─────────────────────────────────────────
    // These still fetch rows but are bounded to confirmed bookings only
    // and used only for chart/route display — not the revenue stat card.
    const [unifiedTrend, hotelTrend, flightTrend, flightSegments, quotesRes, searchesRes] = await Promise.all([
        supabase.from('unified_bookings').select('total_price, created_at, type, metadata, currency').in('status', ['confirmed', 'ticketed', 'awaiting_ticket', 'booked']),
        supabase.from('bookings').select('total_price, created_at, property_name, currency').in('status', ['confirmed', 'ticketed', 'awaiting_ticket']),
        supabase.from('flight_bookings').select('id, total_price, charged_price, created_at').in('status', ['booked', 'ticketed', 'awaiting_ticket']),
        supabase.from('flight_segments').select('booking_id, destination'),
        supabase.from('booking_sessions').select('*', { count: 'exact', head: true }),
        supabase.from('flight_searches').select('*', { count: 'exact', head: true }),
    ]);

    const allConfirmed = [
        ...(unifiedTrend.data || []).map((b: any) => ({
            price: Number(b.total_price) * (b.currency === 'USD' ? PHP_RATE : 1),
            date: b.created_at,
            destination: b.metadata?.destination || b.metadata?.city || b.metadata?.segments?.[0]?.arrival_airport || 'Unknown',
        })),
        ...(hotelTrend.data || []).map((b: any) => ({
            price: Number(b.total_price) * (b.currency === 'USD' ? PHP_RATE : 1),
            date: b.created_at,
            destination: b.property_name || 'Legacy Hotel',
        })),
        ...(flightTrend.data || []).map((b: any) => {
            const segment = (flightSegments.data || []).find(s => s.booking_id === b.id);
            return {
                price: Number(b.charged_price || b.total_price) * PHP_RATE,
                date: b.created_at,
                destination: segment?.destination || 'Legacy Flight',
            };
        }),
    ];

    const getTrendData = (daysBack: number) => {
        const trendMap = new Map<string, number>();
        for (let i = 0; i < daysBack; i++) {
            const d = new Date();
            d.setDate(now.getDate() - i);
            trendMap.set(d.toISOString().split('T')[0], 0);
        }
        allConfirmed.forEach(b => {
            const dateStr = new Date(b.date).toISOString().split('T')[0];
            if (trendMap.has(dateStr)) trendMap.set(dateStr, (trendMap.get(dateStr) || 0) + b.price);
        });
        return Array.from(trendMap.entries())
            .map(([date, revenue]) => ({ date, revenue }))
            .sort((a, b) => a.date.localeCompare(b.date));
    };

    const routeMap = new Map<string, { count: number; revenue: number }>();
    allConfirmed.forEach(b => {
        const curr = routeMap.get(b.destination) || { count: 0, revenue: 0 };
        routeMap.set(b.destination, { count: curr.count + 1, revenue: curr.revenue + b.price });
    });

    const topRoutes = Array.from(routeMap.entries())
        .map(([destination, metrics]) => ({ destination, ...metrics }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

    // ── 6. Provider revenue breakdown (for provider map on dashboard) ─────────
    const providerRevMap = new Map<string, number>();
    (unifiedTrend.data || []).forEach((b: any) => {
        if (b.provider) {
            const price = Number(b.total_price) * (b.currency === 'USD' ? PHP_RATE : 1);
            providerRevMap.set(b.provider, (providerRevMap.get(b.provider) || 0) + price);
        }
    });

    const revenueByProvider = Array.from(providerRevMap.entries())
        .map(([provider, amount]) => ({ provider, amount }))
        .sort((a, b) => b.amount - a.amount);

    // ── 7. Rate metrics (refund/fail/pending %) ───────────────────────────────
    // Use count queries to avoid row limit issues
    const [refundRes, failedRes] = await Promise.all([
        supabase.from('unified_bookings').select('*', { count: 'exact', head: true }).in('status', ['refunded']),
        supabase.from('unified_bookings').select('*', { count: 'exact', head: true }).in('status', ['failed', 'cancelled']),
    ]);

    const unifiedTotalCount = unifiedTotal.count || 1;
    const refundRate  = Math.round(((refundRes.count  || 0) / unifiedTotalCount) * 100);
    const failedRate  = Math.round(((failedRes.count  || 0) / unifiedTotalCount) * 100);
    const pendingRate = Math.round((pendingBookings                               / unifiedTotalCount) * 100);

    // ── Return ────────────────────────────────────────────────────────────────
    return {
        stats: {
            totalBookings,
            revenue: displayRevenue,           // ← from RPC, matches revenue page exactly
            pendingBookings,
            cancelledBookings,
        },
        analytics,
        supplierBreakdown,
        recentActivity: aggregatedActivity,
        revenueTrend: {
            daily:   getTrendData(7),
            weekly:  getTrendData(14),
            monthly: getTrendData(30),
        },
        revenueStats: {
            dailyRevenue:    Math.round(revenueStats?.dailyRevenue   ?? 0),  // ← from RPC
            monthlyRevenue:  Math.round(revenueStats?.monthlyRevenue ?? 0),  // ← from RPC
            revenueByProvider,
            totalMarkup:     Math.round(revenueStats?.totalMarkup    ?? 0),  // ← from RPC
            totalProfit:     Math.round(revenueStats?.totalProfit    ?? 0),  // ← from RPC
            refundRate,
            failedRate,
            pendingRate,
        },
        conversionFunnel: {
            searches:  searchesRes.count || 0,
            quotes:    quotesRes.count   || 0,
            confirmed: allConfirmed.length,
        },
        topRoutes,
        providerIntegrations: await providerIntegrationsPromise,
        defaultCurrency: ((await adminSettingsPromise).default_currency as string) || 'USD',
    };
}

export async function getAdvancedAnalytics(): Promise<AdvancedAnalyticsData> {
    const supabase = createAdminClient();

    const { data: bookings } = await supabase
        .from('unified_bookings')
        .select('provider, status');

    const providers = ['mystifly', 'duffel', 'liteapi'];
    const providerSuccess = providers.map(p => {
        const pBookings = (bookings || []).filter(b => b.provider === p);
        return {
            name: p.charAt(0).toUpperCase() + p.slice(1),
            success: pBookings.filter(b => ['confirmed', 'ticketed'].includes(b.status)).length,
            failure: pBookings.filter(b => ['failed', 'cancelled'].includes(b.status)).length,
        };
    });

    const { data: ticketedBookings } = await supabase
        .from('unified_bookings')
        .select('created_at, updated_at')
        .eq('status', 'ticketed');

    const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const ticketingLatency = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        const dayBookings = (ticketedBookings || []).filter(b => new Date(b.created_at).toDateString() === d.toDateString());
        const avgSeconds = dayBookings.length > 0
            ? dayBookings.reduce((acc, b) => acc + Math.max(0, (new Date(b.updated_at).getTime() - new Date(b.created_at).getTime()) / 1000), 0) / dayBookings.length
            : 0;
        return { day: days[d.getDay()], avgSeconds: Math.round(avgSeconds) };
    });

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
        status: log.response_status || 500,
    }));

    return { providerSuccess, ticketingLatency, errorLogs };
}

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