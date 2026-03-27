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

async function fetchDuffelData(): Promise<ProviderIntegrationsData['duffel']> {
    if (!env.DUFFEL_TOKEN) {
        return { status: 'not_configured', recentOrderCount: null, lastOrderDate: null };
    }

    try {
        const res = await fetch('https://api.duffel.com/air/orders?limit=10', {
            headers: {
                'Authorization': `Bearer ${env.DUFFEL_TOKEN}`,
                'Duffel-Version': 'v2',
                'Accept': 'application/json',
            },
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Duffel API ${res.status}: ${text.slice(0, 200)}`);
        }

        const body = await res.json();
        const orders = body.data || [];

        return {
            status: 'healthy',
            recentOrderCount: orders.length,
            lastOrderDate: orders.length > 0 ? orders[0].created_at : null,
        };
    } catch (error) {
        console.error('[providers] Duffel error:', error);
        return {
            status: 'error',
            recentOrderCount: null,
            lastOrderDate: null,
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

// ── Main export ─────────────────────────────────────────

export async function getProviderIntegrations(): Promise<ProviderIntegrationsData> {
    const [stripe, resend, duffel, mystifly] = await Promise.all([
        fetchStripeData(),
        fetchResendData(),
        fetchDuffelData(),
        fetchMystiflyData(),
    ]);

    return { stripe, resend, duffel, mystifly };
}
