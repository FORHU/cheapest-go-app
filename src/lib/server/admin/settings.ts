import { createAdminClient } from '@/utils/postgres/admin';

export interface IntegrationKey {
    label: string;
    provider: string;
    configured: boolean;
    masked: string;
}

/**
 * Fetch all admin settings as a key-value record.
 */
export async function getAdminSettings(): Promise<Record<string, any>> {
    const supabase = createAdminClient();

    const { data, error } = await supabase
        .from('admin_settings')
        .select('key, value');

    if (error) {
        console.error('[getAdminSettings] Error:', error.message);
        return {};
    }

    const settings: Record<string, any> = {};
    for (const row of data || []) {
        let v = row.value;
        // postgres.js sql.unsafe() returns jsonb string values as their raw JSON
        // representation (e.g. '"USD"' instead of 'USD'). Unwrap if needed.
        if (typeof v === 'string' && v.length >= 2 && v[0] === '"' && v[v.length - 1] === '"') {
            try { const p = JSON.parse(v); if (typeof p === 'string') v = p; } catch { /* keep */ }
        }
        settings[row.key] = v;
    }
    return settings;
}

/**
 * Save admin settings (upsert key-value pairs).
 *
 * Uses raw SQL with an explicit ::jsonb cast because PostgREST's type inference
 * maps JS booleans to SQL boolean — not jsonb — causing a type mismatch error
 * when the column is defined as jsonb.
 */
export async function saveAdminSettings(settings: Record<string, any>): Promise<{ success: boolean; error?: string }> {
    try {
        const { getSqlAdmin } = await import('@/lib/db/postgres');
        const sql = getSqlAdmin();
        for (const [key, value] of Object.entries(settings)) {
            const jsonValue = JSON.stringify(value);
            await sql`
                INSERT INTO admin_settings (key, value)
                VALUES (${key}, ${jsonValue}::jsonb)
                ON CONFLICT (key) DO UPDATE SET value = ${jsonValue}::jsonb
            `;
        }
        return { success: true };
    } catch (err: any) {
        console.error('[saveAdminSettings] Error:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Get masked integration key info (server-only — never exposes full keys to client).
 */
export function getIntegrationKeys(): IntegrationKey[] {
    const mask = (val: string | undefined): string => {
        if (!val) return 'Not configured';
        if (val.length <= 8) return '****';
        return val.slice(0, 4) + '••••••••' + val.slice(-4);
    };

    return [
        {
            label: 'Database',
            provider: 'postgres',
            configured: !!process.env.DATABASE_URL,
            masked: process.env.DATABASE_URL ? 'postgresql://****' : 'Not configured',
        },
        {
            label: 'Stripe Secret Key',
            provider: 'stripe',
            configured: !!process.env.STRIPE_SECRET_KEY,
            masked: mask(process.env.STRIPE_SECRET_KEY),
        },
        {
            label: 'Stripe Webhook Secret',
            provider: 'stripe',
            configured: !!process.env.STRIPE_WEBHOOK_SECRET,
            masked: mask(process.env.STRIPE_WEBHOOK_SECRET),
        },
        {
            label: 'Resend API Key',
            provider: 'resend',
            configured: !!process.env.RESEND_API_KEY,
            masked: mask(process.env.RESEND_API_KEY),
        },
        {
            label: 'Duffel Token',
            provider: 'duffel',
            configured: !!process.env.DUFFEL_ACCESS_TOKEN,
            masked: mask(process.env.DUFFEL_ACCESS_TOKEN),
        },
        {
            label: 'Mystifly Username',
            provider: 'mystifly',
            configured: !!process.env.MYSTIFLY_USERNAME,
            masked: process.env.MYSTIFLY_USERNAME || 'Not configured',
        },
    ];
}
