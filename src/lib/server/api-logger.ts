import { createClient } from '@supabase/supabase-js';
import { env } from '@/utils/env';

export interface ApiLogEntry {
    provider: string;
    endpoint: string;
    method?: string;
    requestParams?: Record<string, unknown>;
    responseStatus?: number;
    responseSummary?: Record<string, unknown>;
    durationMs: number;
    errorMessage?: string;
    userId?: string;
    searchId?: string;
}

/**
 * Fire-and-forget insert to `api_logs`.
 * Never throws — logging must not break the main request flow.
 */
export function logApiCall(entry: ApiLogEntry): void {
    try {
        const url = env.SUPABASE_URL;
        const key = env.SUPABASE_SERVICE_ROLE_KEY;

        if (!url || !key) {
            // Missing credentials — skip silently
            return;
        }

        const supabase = createClient(url, key);

        Promise.resolve(
            supabase
                .from('api_logs')
                .insert({
                    provider: entry.provider,
                    endpoint: entry.endpoint,
                    method: entry.method ?? 'POST',
                    request_params: entry.requestParams ? sanitize(entry.requestParams) : null,
                    response_status: entry.responseStatus ?? null,
                    response_summary: entry.responseSummary ?? null,
                    duration_ms: entry.durationMs,
                    error_message: entry.errorMessage ?? null,
                    user_id: entry.userId ?? null,
                    search_id: entry.searchId ?? null,
                })
        ).then(({ error }) => {
            if (error) console.error('[api-logger] Insert failed:', error.message);
        }).catch(() => {
            // Silently ignore — logging must never break the app
        });
    } catch {
        // Never throw — logging is non-critical
    }
}

/**
 * Strip sensitive keys from request params before persisting.
 */
function sanitize(obj: Record<string, unknown>): Record<string, unknown> {
    const SENSITIVE = new Set([
        'authorization', 'token', 'password', 'secret', 'key',
        'api_key', 'apikey', 'access_token', 'bearer',
    ]);

    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
        if (SENSITIVE.has(k.toLowerCase())) {
            cleaned[k] = '[REDACTED]';
        } else if (v && typeof v === 'object' && !Array.isArray(v)) {
            cleaned[k] = sanitize(v as Record<string, unknown>);
        } else {
            cleaned[k] = v;
        }
    }
    return cleaned;
}
