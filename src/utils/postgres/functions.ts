/**
 * Edge Function caller — drop-in replacement for src/utils/supabase/functions.ts
 *
 * After migration, Edge Functions are hosted as:
 *   1. Next.js API routes under /api/fn/{functionName}  (primary)
 *   2. A self-hosted Deno Deploy instance (fallback / legacy)
 *   3. External HTTP workers (long-running jobs)
 *
 * Set FUNCTIONS_BASE_URL to your self-hosted function server.
 * If not set, falls back to the internal Next.js API at /api/fn/*.
 *
 * Migration guide: for each Supabase Edge Function, either:
 *   a) Create src/app/api/fn/{name}/route.ts  (preferred)
 *   b) Host on Deno Deploy / Fly.io and set FUNCTIONS_BASE_URL
 */

const FUNCTIONS_BASE_URL =
    process.env.FUNCTIONS_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'http://localhost:3000';

const FUNCTIONS_SECRET = process.env.FUNCTIONS_SECRET || process.env.INTERNAL_SECRET || '';

export async function invokeEdgeFunction<T = any>(
    functionName: string,
    body?: any,
    options?: { headers?: Record<string, string>; method?: 'POST' | 'GET' | 'PUT' | 'DELETE' | 'PATCH' }
): Promise<T> {
    // Try internal API route first (/api/fn/{name}), then external
    const internalUrl = `${FUNCTIONS_BASE_URL}/api/fn/${functionName}`;
    const method = options?.method || 'POST';

    const maxRetries = 1;
    let fallbackRetryDelay = 2000;

    for (let i = 0; i <= maxRetries; i++) {
        const response = await fetch(internalUrl, {
            method,
            headers: {
                'Content-Type': 'application/json',
                // Use a shared secret instead of Supabase anon key
                'Authorization': FUNCTIONS_SECRET ? `Bearer ${FUNCTIONS_SECRET}` : '',
                'X-Internal-Request': '1',
                ...options?.headers,
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        if (response.ok) {
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('ndjson')) {
                const text = await response.text();
                const allData: any[] = [];
                const allMappable: any[] = [];
                let totalCount = 0;
                for (const line of text.split('\n')) {
                    if (!line.trim()) continue;
                    try {
                        const chunk = JSON.parse(line);
                        if (chunk.type === 'hotels' && Array.isArray(chunk.data)) {
                            allData.push(...chunk.data);
                            if (Array.isArray(chunk.allMappable)) allMappable.push(...chunk.allMappable);
                            if (chunk.totalCount) totalCount = chunk.totalCount;
                        } else if (chunk.type === 'done' && chunk.totalCount) {
                            totalCount = chunk.totalCount;
                        }
                    } catch { }
                }
                return { data: allData, totalCount: totalCount || allData.length, allMappable } as T;
            }
            return response.json() as Promise<T>;
        }

        let errorText = '';
        try { errorText = await response.text(); } catch { errorText = 'Could not read error'; }

        const is429 = response.status === 429 || errorText.includes('429') || errorText.toLowerCase().includes('too many requests');
        if (is429 && i < maxRetries) {
            const retryAfter = response.headers.get('retry-after');
            const delay = retryAfter
                ? Math.min(parseInt(retryAfter) * 1000, 5000)
                : Math.min(fallbackRetryDelay * Math.pow(2, i), 5000);
            console.warn(`Rate limit hit on ${functionName} (429). Retrying in ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
            continue;
        }

        const isHtml = errorText.trimStart().startsWith('<');
        const details = isHtml ? '' : errorText.slice(0, 500);
        let parsedError: any = null;
        if (!isHtml) { try { parsedError = JSON.parse(errorText); } catch { } }

        let friendly = '';
        if (response.status === 502 || response.status === 503 || response.status === 504) {
            friendly = 'The service is temporarily unavailable. Please try again in a moment.';
        } else if (is429) {
            friendly = 'Too many requests. Please wait a moment and try again.';
        } else if (parsedError?.details || parsedError?.error) {
            const errVal = parsedError.details || parsedError.error;
            friendly = typeof errVal === 'string' ? errVal : (errVal?.message || JSON.stringify(errVal));
        } else {
            friendly = details || response.statusText || 'Unexpected error';
        }

        const message = details && !isHtml && friendly.length < 200 && !friendly.includes(details.substring(0, 20))
            ? `${friendly} — ${details}` : friendly;

        throw new Error(`Error invoking ${functionName}: ${message}`);
    }

    throw new Error(`Error invoking ${functionName}: Max retries exceeded`);
}

export async function searchLiteApi(params: any) {
    return invokeEdgeFunction('liteapi-search', params);
}

export async function preBook(params: any) {
    return invokeEdgeFunction('pre-book', params);
}

export async function getHotelDetails(hotelId: string, options: any = {}) {
    const { checkIn, checkOut, adults, children, rooms, currency } = options;
    const result = await searchLiteApi({
        hotelIds: [hotelId],
        checkin: checkIn,
        checkout: checkOut,
        adults,
        children,
        rooms: rooms || 1,
        currency,
    });
    return result?.data?.[0] || null;
}
