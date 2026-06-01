import { createAdminClient } from '@/utils/postgres/admin';
import { createAdminClient } from '@/utils/supabase/admin';
import { env } from '@/utils/env';

// Module-level cache — survives across requests within a warm serverless instance.
// TTL: 60 s. On key rotation the admin writes to DB; next request after TTL picks it up.
let _cachedKey: string | null = null;
let _cacheExpiry = 0;

/**
 * Returns the active mobile API key.
 * Priority: admin_settings.mobile_api_key → env.MOBILE_API_KEY
 * Cached for 60 s to avoid a DB round-trip on every mobile request.
 */
export async function getMobileApiKey(): Promise<string | null> {
    if (Date.now() < _cacheExpiry && _cachedKey !== null) return _cachedKey;

    try {
        const supabase = createAdminClient();
        const { data } = await supabase
            .from('admin_settings')
            .select('value')
            .eq('key', 'mobile_api_key')
            .maybeSingle();

        // admin_settings stores JSONB — value is a JSON string like `"abc123"`
        const dbKey = data?.value ? JSON.parse(JSON.stringify(data.value)) : null;
        _cachedKey = (typeof dbKey === 'string' && dbKey.length > 0 ? dbKey : null)
            ?? env.MOBILE_API_KEY
            ?? null;
    } catch {
        _cachedKey = env.MOBILE_API_KEY ?? null;
    }

    _cacheExpiry = Date.now() + 60_000;
    return _cachedKey;
}

/** Call after rotating the key so the next request re-reads from DB immediately. */
export function invalidateMobileKeyCache() {
    _cachedKey = null;
    _cacheExpiry = 0;
}

/** Generate a cryptographically secure random API key. */
export function generateMobileApiKey(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
