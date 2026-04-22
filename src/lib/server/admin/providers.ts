import { getStripe } from '@/lib/stripe/server';
import { env } from '@/utils/env';
import { createAdminClient } from '@/utils/supabase/admin';
import type { ProviderIntegrationsData } from '@/types/admin';

// ── Stripe ──────────────────────────────────────────────

async function fetchStripeData(): Promise<ProviderIntegrationsData['stripe']> {
    if (!env.STRIPE_SECRET_KEY) {
        return { status: 'not_configured', balance: null, recentPaymentCount: null, totalVolume: null, refundCount: null };
    }

    try {
        const stripe = getStripe();
        const [balance, charges, refunds] = await Promise.all([
            stripe.balance.retrieve(),
            stripe.charges.list({ limit: 10 }),
            stripe.refunds.list({ limit: 5 }),
        ]);

        const available = balance.available.reduce((sum, b) => sum + b.amount, 0);
        const totalVolume = charges.data.reduce((sum, c) => sum + c.amount, 0);

        return {
            status: 'healthy',
            balance: available,
            recentPaymentCount: charges.data.length,
            totalVolume,
            refundCount: refunds.data.length,
        };
    } catch (error) {
        console.error('[providers] Stripe error:', error);
        return {
            status: 'error',
            balance: null,
            recentPaymentCount: null,
            totalVolume: null,
            refundCount: null,
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

// ── Resend ──────────────────────────────────────────────

async function fetchResendData(): Promise<ProviderIntegrationsData['resend']> {
    if (!env.RESEND_API_KEY) {
        return { status: 'not_configured', recentEmailCount: null, deliveryRate: null, domainStatus: null };
    }

    try {
        const headers = { 'Authorization': `Bearer ${env.RESEND_API_KEY}` };

        const [emailsRes, domainsRes] = await Promise.all([
            fetch('https://api.resend.com/emails', { headers }),
            fetch('https://api.resend.com/domains', { headers }),
        ]);

        let recentEmailCount: number | null = null;
        let deliveryRate: number | null = null;
        if (emailsRes.ok) {
            const body = await emailsRes.json();
            const emails = body.data || [];
            const count = emails.length;
            recentEmailCount = count;
            const delivered = emails.filter((e: any) =>
                e.last_event === 'delivered' || e.last_event === 'opened' || e.last_event === 'clicked'
            ).length;
            deliveryRate = count > 0 ? Math.round((delivered / count) * 100) : 0;
        } else if (emailsRes.status !== 401) {
            console.error('[providers] Resend emails API:', emailsRes.status, await emailsRes.text().catch(() => ''));
        }

        let domainStatus: string | null = null;
        if (domainsRes.ok) {
            const body = await domainsRes.json();
            const domains = body.data || [];
            domainStatus = domains.length > 0 ? domains[0].status : 'no domains';
        } else if (domainsRes.status !== 401) {
            console.error('[providers] Resend domains API:', domainsRes.status, await domainsRes.text().catch(() => ''));
        }

        // Handle restricted API key (send-only)
        if (!emailsRes.ok && emailsRes.status === 401) {
            return {
                status: 'healthy',
                recentEmailCount: null,
                deliveryRate: null,
                domainStatus: 'send-only key',
                errorMessage: 'API key restricted to sending only — update key permissions in Resend dashboard',
            };
        }

        const anyOk = emailsRes.ok || domainsRes.ok;
        return {
            status: anyOk ? 'healthy' : 'error',
            recentEmailCount,
            deliveryRate,
            domainStatus,
            ...(!anyOk ? { errorMessage: `emails: ${emailsRes.status}, domains: ${domainsRes.status}` } : {}),
        };
    } catch (error) {
        console.error('[providers] Resend error:', error);
        return {
            status: 'error',
            recentEmailCount: null,
            deliveryRate: null,
            domainStatus: null,
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

// ── Duffel ──────────────────────────────────────────────

/** Fetch a single page of Duffel orders */
async function fetchDuffelOrderPage(
    token: string,
    after?: string,
): Promise<{ data: any[]; meta: any }> {
    const params = new URLSearchParams({ limit: '200', sort: '-created_at' });
    if (after) params.set('after', after);

    const res = await fetch(`https://api.duffel.com/air/orders?${params}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Duffel-Version': 'v2',
            'Accept': 'application/json',
        },
        // 15 s timeout per page
        signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Duffel API ${res.status}: ${text.slice(0, 200)}`);
    }

    const body = await res.json();
    return { data: body.data || [], meta: body.meta || {} };
}

/** Collect all orders created in the last N days */
async function fetchAllDuffelOrders(token: string, days = 30): Promise<any[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffMs = cutoff.getTime();

    const allOrders: any[] = [];
    let after: string | undefined;
    let pageCount = 0;
    const MAX_PAGES = 10; // guard against runaway pagination

    while (pageCount < MAX_PAGES) {
        const { data, meta } = await fetchDuffelOrderPage(token, after);
        pageCount++;

        for (const order of data) {
            if (new Date(order.created_at).getTime() >= cutoffMs) {
                allOrders.push(order);
            }
        }

        // Stop if the oldest item on this page is already before cutoff,
        // or if there's no next cursor
        const hasMore = !!meta?.after;
        const oldestOnPage = data[data.length - 1];
        const oldestMs = oldestOnPage ? new Date(oldestOnPage.created_at).getTime() : 0;

        if (!hasMore || oldestMs < cutoffMs) break;
        after = meta.after;
    }

    return allOrders;
}

async function fetchDuffelData(): Promise<ProviderIntegrationsData['duffel']> {
    const EMPTY = {
        status: 'not_configured' as const,
        ordersCreated: null,
        grossOrderValue: null,
        orderCurrency: null,
        ordersCancelled: null,
        ordersChanged: null,
        ancillariesSold: null,
        grossAncillaryVolume: null,
        ancillaryAttachmentRate: null,
        dailyOrdersChart: [],
        topAirlinesByVolume: [],
        topAirlinesByValue: [],
        topRoutesByVolume: [],
        topRoutesByValue: [],
        recentOrders: [],
        recentOrderCount: null,
        lastOrderDate: null,
        passengerCount: null,
    };

    if (!env.DUFFEL_TOKEN) return EMPTY;

    try {
        const orders = await fetchAllDuffelOrders(env.DUFFEL_TOKEN, 30);

        // ── Aggregate maps ────────────────────────────────
        const airlineVolume  = new Map<string, { name: string; iataCode: string; count: number; value: number; currency: string }>();
        const routeVolume    = new Map<string, { origin: string; destination: string; count: number; value: number; currency: string }>();
        const dailyMap       = new Map<string, { orders: number; value: number }>();

        let grossOrderValue     = 0;
        let ordersCancelled     = 0;
        let ordersChanged       = 0;
        let ancillariesSold     = 0;
        let grossAncillaryVolume= 0;
        let passengerCount      = 0;
        const currency          = orders[0]?.total_currency || 'USD';

        // Pre-fill daily chart with zeros for the last 30 days
        for (let i = 29; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            dailyMap.set(d.toISOString().split('T')[0], { orders: 0, value: 0 });
        }

        const recentOrders = orders.slice(0, 25).map((order: any) => {
            const amount = parseFloat(order.total_amount || '0');
            const isCancelled = !!order.cancelled_at;
            const isChanged   = (order.changes?.length ?? 0) > 0;

            // Revenue (all non-cancelled orders)
            if (!isCancelled) grossOrderValue += amount;
            if (isCancelled)  ordersCancelled++;
            if (isChanged)    ordersChanged++;

            // Ancillaries
            const services: any[] = order.services || [];
            const ancillaryServices = services.filter((s: any) => s.type !== 'baggage' || s.metadata);
            ancillariesSold     += ancillaryServices.length;
            grossAncillaryVolume += ancillaryServices.reduce((s: number, svc: any) => s + parseFloat(svc.total_amount || '0'), 0);

            // Passengers
            const pax: any[] = order.passengers || [];
            passengerCount += pax.length;

            // Daily chart
            const dateKey = order.created_at?.split('T')[0];
            if (dateKey && dailyMap.has(dateKey)) {
                const d = dailyMap.get(dateKey)!;
                d.orders++;
                if (!isCancelled) d.value += amount;
            }

            // Airline — prefer owner (ticketing airline)
            const owner = order.owner;
            if (owner?.name) {
                const key = owner.iata_code || owner.name;
                const existing = airlineVolume.get(key) || { name: owner.name, iataCode: owner.iata_code || '', count: 0, value: 0, currency };
                existing.count++;
                if (!isCancelled) existing.value += amount;
                airlineVolume.set(key, existing);
            }

            // Route — first slice origin → last slice destination
            const firstSlice = order.slices?.[0];
            const lastSlice  = order.slices?.[order.slices.length - 1];
            if (firstSlice && lastSlice) {
                const orig = firstSlice.origin?.iata_code || '???';
                const dest = lastSlice.destination?.iata_code || '???';
                const routeKey = `${orig}→${dest}`;
                const ex = routeVolume.get(routeKey) || { origin: orig, destination: dest, count: 0, value: 0, currency };
                ex.count++;
                if (!isCancelled) ex.value += amount;
                routeVolume.set(routeKey, ex);
            }

            // Normalize to DuffelOrder shape
            const firstPax = pax[0];
            const passengerName = firstPax
                ? `${firstPax.given_name || ''} ${firstPax.family_name || ''}`.trim()
                : 'Unknown Passenger';

            return {
                id: order.id,
                bookingReference: order.booking_reference || order.id.slice(0, 8).toUpperCase(),
                passengerName,
                origin: firstSlice?.origin?.iata_code || '???',
                destination: lastSlice?.destination?.iata_code || '???',
                departureDate: firstSlice?.segments?.[0]?.departing_at || '',
                totalAmount: order.total_amount || '0',
                currency: order.total_currency || 'USD',
                status: (order.payment_status?.awaiting_payment
                    ? 'awaiting_payment'
                    : isCancelled ? 'cancelled' : 'confirmed') as import('@/types/admin').DuffelOrder['status'],
                createdAt: order.created_at,
            };
        });

        // ── Sort top 5 airlines ───────────────────────────
        const airlineArr = Array.from(airlineVolume.values());
        const topAirlinesByVolume = [...airlineArr].sort((a, b) => b.count - a.count).slice(0, 5);
        const topAirlinesByValue  = [...airlineArr].sort((a, b) => b.value - a.value).slice(0, 5);

        // ── Sort top 5 routes ─────────────────────────────
        const routeArr = Array.from(routeVolume.entries()).map(([routeKey, v]) => ({
            route: `${v.origin} → ${v.destination}`,
            ...v,
        }));
        const topRoutesByVolume = [...routeArr].sort((a, b) => b.count - a.count).slice(0, 5);
        const topRoutesByValue  = [...routeArr].sort((a, b) => b.value - a.value).slice(0, 5);

        // ── Daily chart array ─────────────────────────────
        const dailyOrdersChart = Array.from(dailyMap.entries())
            .map(([date, v]) => ({ date, ...v }))
            .sort((a, b) => a.date.localeCompare(b.date));

        // ── Ancillary attachment rate ─────────────────────
        const confirmedCount = orders.filter((o: any) => !o.cancelled_at).length;
        const ancillaryAttachmentRate = confirmedCount > 0
            ? Math.round((ancillariesSold / confirmedCount) * 100)
            : 0;

        return {
            status: 'healthy',
            ordersCreated: orders.length,
            grossOrderValue: Math.round(grossOrderValue * 100) / 100,
            orderCurrency: currency,
            ordersCancelled,
            ordersChanged,
            ancillariesSold,
            grossAncillaryVolume: Math.round(grossAncillaryVolume * 100) / 100,
            ancillaryAttachmentRate,
            dailyOrdersChart,
            topAirlinesByVolume,
            topAirlinesByValue,
            topRoutesByVolume,
            topRoutesByValue,
            recentOrders,
            // legacy compat
            recentOrderCount: orders.length,
            lastOrderDate: orders.length > 0 ? orders[0].created_at : null,
            passengerCount,
        };

    } catch (error) {
        console.error('[providers] Duffel error:', error);
        return {
            ...EMPTY,
            status: 'error',
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

// ── Mystifly (local DB — no public stats API) ──────────

async function fetchMystiflyData(): Promise<ProviderIntegrationsData['mystifly']> {
    const configured = !!env.MYSTIFLY_USERNAME && !!env.MYSTIFLY_PASSWORD && !!env.MYSTIFLY_ACCOUNT_NUMBER;

    if (!configured) {
        return { status: 'not_configured', bookingCount: null, configStatus: 'missing_credentials' };
    }

    try {
        const supabase = createAdminClient();
        const [unifiedCount, legacyCount] = await Promise.all([
            supabase.from('unified_bookings').select('*', { count: 'exact', head: true }).eq('provider', 'mystifly'),
            supabase.from('flight_bookings').select('*', { count: 'exact', head: true }).eq('provider', 'mystifly'),
        ]);

        return {
            status: 'healthy',
            bookingCount: (unifiedCount.count || 0) + (legacyCount.count || 0),
            configStatus: 'configured',
        };
    } catch (error) {
        console.error('[providers] Mystifly error:', error);
        return {
            status: 'error',
            bookingCount: null,
            configStatus: 'error',
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

// ── LiteAPI (Supabase DB + Edge health) ─────────────────

async function fetchLiteApiData(): Promise<ProviderIntegrationsData['liteapi']> {
    const configured = !!env.SUPABASE_URL && !!env.SUPABASE_ANON_KEY;

    if (!configured) {
        return { status: 'not_configured', searchCount: null, bookingCount: null };
    }

    try {
        const supabase = createAdminClient();
        
        // Fetch counts from tracking tables
        const [searches, bookings] = await Promise.all([
            supabase.from('flight_searches').select('*', { count: 'exact', head: true }),
            supabase.from('unified_bookings').select('*', { count: 'exact', head: true }).eq('provider', 'liteapi'),
        ]);

        return {
            status: 'healthy',
            searchCount: searches.count || 0,
            bookingCount: bookings.count || 0,
        };
    } catch (error) {
        console.error('[providers] LiteAPI error:', error);
        return {
            status: 'error',
            searchCount: null,
            bookingCount: null,
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

// ── Main export ─────────────────────────────────────────

export async function getProviderIntegrations(): Promise<ProviderIntegrationsData> {
    const [stripe, resend, duffel, mystifly, liteapi] = await Promise.all([
        fetchStripeData(),
        fetchResendData(),
        fetchDuffelData(),
        fetchMystiflyData(),
        fetchLiteApiData(),
    ]);

    return { stripe, resend, duffel, mystifly, liteapi };
}
