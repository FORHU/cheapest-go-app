/**
 * Frontend API client wrapper.
 * All frontend hooks/components use this instead of raw fetch.
 * Standardizes request format and error handling.
 */

export async function apiFetch<T = any>(
    url: string,
    body?: Record<string, unknown>
): Promise<{ success: true; data: T } | { success: false; error: string; [key: string]: unknown }> {
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Custom header used as CSRF proof. Browsers cannot set custom headers
                // on cross-origin requests without a CORS preflight (which would fail),
                // so this is a valid same-origin proof. The `Origin` header is a
                // forbidden header name — JS cannot set it, so we use this instead.
                'X-Requested-By': 'cheapestgo-client',
            },
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
