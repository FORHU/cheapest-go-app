import { createAdminClient } from '@/utils/supabase/admin';

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
        settings[row.key] = row.value;
    }
    return settings;
}

/**
 * Save admin settings (upsert key-value pairs).
 */
export async function saveAdminSettings(settings: Record<string, any>): Promise<{ success: boolean; error?: string }> {
    const supabase = createAdminClient();

    const rows = Object.entries(settings).map(([key, value]) => ({
        key,
        value: JSON.parse(JSON.stringify(value)),
    }));

    const { error } = await supabase
        .from('admin_settings')
        .upsert(rows, { onConflict: 'key' });

    if (error) {
        console.error('[saveAdminSettings] Error:', error.message);
        return { success: false, error: error.message };
    }

    return { success: true };
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
            label: 'Supabase URL',
            provider: 'supabase',
            configured: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
            masked: process.env.NEXT_PUBLIC_SUPABASE_URL || 'Not configured',
        },
        {
            label: 'Supabase Service Role',
            provider: 'supabase',
            configured: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
            masked: mask(process.env.SUPABASE_SERVICE_ROLE_KEY),
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
