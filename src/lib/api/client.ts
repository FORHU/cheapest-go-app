/**
 * Frontend API client wrapper.
 * All frontend hooks/components use this instead of raw fetch.
 * Standardizes request format and error handling.
 */

/** CSRF header value — must match checkCsrf() on the server */
const CSRF_HEADER = { 'X-Requested-By': 'cheapestgo-client' } as const;

/**
 * Drop-in replacement for the native `fetch()` that automatically injects
 * the CSRF header on every request. Use this instead of raw fetch() in
 * client components/hooks so the server-side CSRF check always passes.
 *
 * @example
 * const res = await clientFetch('/api/flights/book', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify(payload),
 * });
 */
export function clientFetch(url: string, init: RequestInit = {}): Promise<Response> {
    return fetch(url, {
        ...init,
        headers: {
            ...CSRF_HEADER,
            ...(init.headers as Record<string, string> | undefined),
        },
    });
}

export async function apiFetch<T = any>(
    url: string,
    body?: Record<string, unknown>
): Promise<{ success: true; data: T } | { success: false; error: string; [key: string]: unknown }> {
    try {
        const res = await clientFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {}),
        });

        const json = await res.json();

        if (!res.ok) {
            // Spread full JSON so callers can inspect extra fields (e.g. code, existingBookingId)
            return {
                ...json,
                success: false,
                error: json?.error || `Request failed with status ${res.status}`,
            };
        }

        return json;
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Network request failed',
        };
    }
}
