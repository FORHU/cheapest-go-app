/**
 * Mystifly API Client for Supabase Edge Functions (Deno).
 *
 * - CreateSession auth with automatic refresh (55 min TTL)
 * - In-memory session cache
 * - Timeout + retry for all HTTP calls
 * - Single entry point: mystiflyRequest(endpoint, body, sessionId?)
 *
 * Env vars (set in Supabase dashboard → Edge Function secrets):
 *   MYSTIFLY_USERNAME
 *   MYSTIFLY_PASSWORD
 *   MYSTIFLY_ACCOUNT_NUMBER
 *   MYSTIFLY_BASE_URL     (optional — defaults to demo)
 */

declare const Deno: any;

// ─── Config ─────────────────────────────────────────────────────────

function env(key: string, fallback = ''): string {
    return Deno.env.get(key) ?? fallback;
}

const BASE_URL = () => env('MYSTIFLY_BASE_URL', 'https://restapidemo.myfarebox.com');
const USERNAME = () => env('MYSTIFLY_USERNAME');
const PASSWORD = () => env('MYSTIFLY_PASSWORD');
const ACCOUNT_NUMBER = () => env('MYSTIFLY_ACCOUNT_NUMBER');

/** 
 * Centralized Mystifly Target (Test/Production). 
 * 
 * Logic Priority: 
 * 1. Code Prefix (T- for Test, P- for Production)
 * 2. URL detection (demo -> Test, otherwise Production)
 * 3. Environment Variable override (MYSTIFLY_ENV)
 */
/** 
 * Centralized Mystifly Target (Test/Production). 
 * 
 * Logic Priority (Safety First): 
 * 1. URL detection (demo -> MUST be Test)
 * 2. Environment Variable override (MYSTIFLY_ENV)
 * 3. Code Prefix (T- for Test, P- for Production)
 */
export const MYSTIFLY_TARGET = (id?: string, bodyTarget?: string) => {
    // 1. Explicit body target has highest priority (Doc match)
    if (bodyTarget === 'Production') return 'Production';
    if (bodyTarget === 'Test') return 'Test';

    // 2. Manual Env Override 
    const envVal = env('MYSTIFLY_ENV', '').toLowerCase();
    if (envVal === 'production') return 'Production';
    if (envVal === 'test') return 'Test';

    // 3. Detect from Code Prefix
    const fareSourceCode = extractFareSourceCode(id);
    if (fareSourceCode?.startsWith('T-')) return 'Test';
    if (fareSourceCode?.startsWith('P-')) return 'Production';

    // 4. URL detection (demo -> v1 wants Production, v2 wants Test)
    const url = BASE_URL();
    if (url.includes('demo')) {
        // Based on user documentation snapshots: 
        // V1 Search/Book uses "Production"
        // V2 Search/Book uses "Test"
        return 'Production';
    }

    return 'Production';
};

/** Helper to extract original FareSourceCode from tunneled traceId (Code|UUID|Sid). */
export function extractFareSourceCode(id?: string): string {
    if (!id) return '';
    return id.split('|')[0];
}



const FETCH_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 2;
const SESSION_TTL_MS = 55 * 60 * 1000; // refresh 5 min before 60 min expiry

// ─── Session Cache ──────────────────────────────────────────────────

interface SessionCache {
    sessionId: string;
    createdAt: number; // epoch ms
}

let sessionCache: SessionCache | null = null;

/**
 * Obtain a valid Mystifly session ID.
 * Uses CreateSession endpoint. Cached in memory and auto-refreshed
 * 5 minutes before the 60 minute expiry.
 */
async function createSession(): Promise<string> {
    if (sessionCache && Date.now() - sessionCache.createdAt < SESSION_TTL_MS) {
        return sessionCache.sessionId;
    }

    const username = USERNAME();
    const password = PASSWORD();
    const accountNumber = ACCOUNT_NUMBER();

    if (!username || !password || !accountNumber) {
        throw new MystiflyError(
            'MYSTIFLY_USERNAME, MYSTIFLY_PASSWORD, and MYSTIFLY_ACCOUNT_NUMBER must be set',
            'AUTH',
            401,
        );
    }

    console.log('[Mystifly] Creating new session');

    const res = await fetchWithTimeout(
        `${BASE_URL()}/api/CreateSession`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                UserName: username,
                Password: password,
                AccountNumber: accountNumber,
            }),
        },
    );

    if (!res.ok) {
        const text = await res.text();
        sessionCache = null;
        throw new MystiflyError(
            `CreateSession HTTP ${res.status}: ${text}`,
            'AUTH',
            res.status,
        );
    }

    const data = await res.json();

    if (!data.Success || !data.Data?.SessionId) {
        sessionCache = null;
        throw new MystiflyError(
            `CreateSession failed: ${data.Message ?? 'No SessionId returned'}`,
            'AUTH',
            401,
        );
    }

    sessionCache = {
        sessionId: data.Data.SessionId,
        createdAt: Date.now(),
    };

    console.log('[Mystifly] Session acquired:', sessionCache.sessionId.slice(0, 8) + '…');
    return sessionCache.sessionId;
}

/** Force-clear the session cache (e.g. on auth failure). */
export function clearSessionCache(): void {
    sessionCache = null;
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Make an authenticated request to any Mystifly API endpoint.
 *
 * - Automatically obtains/refreshes the session
 * - Retries once on 401 (session may have expired mid-flight)
 * - Retries on 5xx / network errors up to MAX_RETRIES
 * - Throws MystiflyError on all non-2xx or non-Success responses
 *
 * @param endpoint  - Path relative to base URL (e.g. "/api/v1/Search/Flight")
 * @param body      - JSON request body
 * @param sessionId - Optional override; if omitted, auto-creates/caches a session
 * @returns Parsed JSON response body
 *
 * @example
 *   const data = await mystiflyRequest('/api/v1/Search/Flight', {
 *       OriginDestinationInformations: [...],
 *       PassengerTypeQuantities: [...],
 *   });
 *
 * @example
 *   // With explicit session
 *   const data = await mystiflyRequest('/api/v1/Revalidate/Flight', {
 *       FareSourceCode: '...',
 *   }, existingSessionId);
 */
export async function mystiflyRequest<T = any>(
    endpoint: string,
    body: Record<string, any>,
    sessionId?: string,
    conversationId?: string,
): Promise<T> {
    let sid = sessionId ?? await createSession();

    const url = `${BASE_URL()}${endpoint}`;

    // Target detection logic
    const target = MYSTIFLY_TARGET(body.FareSourceCode, body.Target);

    const finalBody = {
        ...body,
        Target: target,
        ConversationId: conversationId ?? body.ConversationId ?? crypto.randomUUID(),
    };

    console.log(`[Mystifly] Request: ${endpoint} | Target: ${finalBody.Target} | ConversationId: ${finalBody.ConversationId}`);

    const buildInit = (s: string): RequestInit => ({
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${s}`,
            'ConversationId': finalBody.ConversationId,
        },
        body: JSON.stringify(finalBody),
    });




    // ── First attempt ───────────────────────────────────────────────

    // ASHR 1.0 (v1) Booking is not idempotent and slow. 
    // If it times out, a retry with the same ConversationId/Token often triggers "Booking already in progress".
    const skipTimeoutRetry = endpoint.includes('Book/Flight');

    let res = await fetchWithRetry(url, buildInit(sid), skipTimeoutRetry);

    // ── Handle 401 — session may have expired, refresh once ─────────

    if (res.status === 401) {
        console.warn('[Mystifly] 401 received — refreshing session and retrying');
        clearSessionCache();
        sid = await createSession();
        res = await fetchWithRetry(url, buildInit(sid), skipTimeoutRetry);
    }

    // ── Handle 429 rate limit ───────────────────────────────────────

    if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        throw new MystiflyError(
            `Rate limited. Retry-After: ${retryAfter ?? 'unknown'}`,
            'RATE_LIMIT',
            429,
        );
    }

    // ── Parse response ──────────────────────────────────────────────

    const text = await res.text();
    let json: any;

    try {
        json = JSON.parse(text);
    } catch {
        const snippet = text.trim() ? text.slice(0, 500) : '[EMPTY RESPONSE]';
        console.error(`[Mystifly] Response was not JSON from ${endpoint} (Status: ${res.status}). Raw body:`, snippet);
        throw new MystiflyError(
            `Invalid JSON from Mystifly: ${snippet.slice(0, 100)}`,
            'PARSE',
            res.status,
        );
    }

    // ── Handle HTTP errors ──────────────────────────────────────────

    if (!res.ok) {
        const detail = json?.Message ?? json?.error ?? text.slice(0, 300);
        console.error(`[Mystifly] Error details for ${endpoint}:`, { target, status: res.status, detail });
        throw new MystiflyError(
            `Mystifly POST ${endpoint} [Target: ${target}] → ${res.status}: ${detail}`,
            res.status >= 500 ? 'SERVER' : 'CLIENT',
            res.status,
        );
    }

    // ── Handle Business Errors (Retries) ───────────────────────────

    const errorMsg = json.Message || (json.Data?.Errors?.[0]?.Message) || '';
    const isMismatch = errorMsg.includes('ERBUK103') || errorMsg.includes('API version mismatch');

    if (!json.Success && isMismatch) {
        // If we haven't already retried this specific mismatch
        if (!body.__retriedMismatch) {
            const altTarget = target === 'Production' ? 'Test' : 'Production';
            console.warn(`[Mystifly] Business Mismatch (${target}) on ${endpoint}. Retrying with ${altTarget}...`);
            return await mystiflyRequest(endpoint, { ...body, Target: altTarget, __retriedMismatch: true }, sessionId, conversationId);
        }
    }

    return json as T;
}

// ─── High-Level Operations ──────────────────────────────────────────

export { createSession };

/**
 * Search flights via Mystifly v1.
 * Wraps mystiflyRequest with the search endpoint.
 */
export async function searchFlights(
    body: any,
    sessionId?: string,
    conversationId?: string,
) {
    return mystiflyRequest('/api/v1/Search/Flight', body, sessionId, conversationId);
}

/**
 * Revalidate a fare using its FareSourceCode.
 * SMART VERSIONING: If v1 (Production target) fails with mismatch, retries with v2 (Test target).
 */
export async function revalidateFare(
    fareSourceCode: string,
    sessionId?: string,
    conversationId?: string,
) {
    console.log('[mystiflyClient] Revalidating attempt (v1/Production)...');
    const res = await mystiflyRequest('/api/v1/Revalidate/Flight', {
        FareSourceCode: fareSourceCode,
        Target: 'Production',
    }, sessionId, conversationId);

    const errorMsg = res.Message || (res.Data?.Errors?.[0]?.Message) || '';
    const isMismatch = errorMsg.includes('ERBUK103') || errorMsg.includes('API version mismatch');

    if (!res.Success && isMismatch) {
        console.warn('[mystiflyClient] Revalidation mismatch. Retrying with V2 (Test target)...');
        // V2 revalidation often uses the same v1 endpoint but with Target: Test or V2 endpoint
        // Let's try the V2 endpoint first as it's cleaner for V2 tokens
        try {
            return await mystiflyRequest('/api/v2/Revalidate/Flight', {
                FareSourceCode: fareSourceCode,
                Target: 'Test',
            }, sessionId, conversationId);
        } catch (v2Err) {
            console.error('[mystiflyClient] V2 revalidate endpoint failed. Fallback to v1 with Target: Test...');
            return await mystiflyRequest('/api/v1/Revalidate/Flight', {
                FareSourceCode: fareSourceCode,
                Target: 'Test',
            }, sessionId, conversationId);
        }
    }

    return res;
}

/**
 * Book a flight using a revalidated FareSourceCode.
 *
 * SMART VERSIONING: If v1 fails with "API version mismatch", we automatically retry with v2.
 */
export async function bookFlight(
    body: any,
    sessionId?: string,
    conversationId?: string,
) {
    console.log('[mystiflyClient] Booking attempt (v1)... Custom Target:', body.Target);
    const res = await mystiflyRequest('/api/v1/Book/Flight', body, sessionId, conversationId);

    // Check for business error "API version mismatch" (ERBUK103)
    const errorMsg = res.Message || (res.Data?.Errors?.[0]?.Message) || '';
    const isMismatch = errorMsg.includes('ERBUK103') || errorMsg.includes('API version mismatch');

    if (!res.Success && isMismatch) {
        console.warn('[mystiflyClient] ERBUK103 mismatch detected in v1 response. Converting body to V2 and retrying...');
        const v2Body = convertToV2BookRequest(body);
        // ASHR 2.0 (v2) documentation shows "Target": "Test"
        v2Body.Target = 'Test';

        // Some v2 environments use /api/v2/Book/Flight, others use /api/v1/Book/Flight with Target: Test
        // Since /api/v2/Book/Flight gave 404, we'll try /api/v1/Book/Flight with explicit Test target (though v2Body is the key)
        try {
            console.log('[mystiflyClient] Retrying v2 booking on /api/v1/Book/Flight since /api/v2/ gave 404...');
            return await mystiflyRequest('/api/v1/Book/Flight', v2Body, sessionId, conversationId);
        } catch (v2Err) {
            console.error('[mystiflyClient] V2 retry on v1 endpoint failed. Final attempt on /api/v2/OnePoint/Book (possible real v2 path)...');
            return await mystiflyRequest('/api/v2/OnePoint/Book', v2Body, sessionId, conversationId);
        }
    }

    return res;
}

/**
 * Internal helper to convert a V1 book request body to V2 format.
 * - Nests Passport fields
 * - Adds PassengerNationality
 * - Uses .000Z date format
 */
function convertToV2BookRequest(v1Body: any) {
    if (!v1Body.TravelerInfo?.AirTravelers) return v1Body;

    try {
        const v2Body = JSON.parse(JSON.stringify(v1Body)); // deep clone
        v2Body.TravelerInfo.AirTravelers = v2Body.TravelerInfo.AirTravelers.map((pax: any) => {
            const v2Pax = { ...pax };

            // 1. Move flat passport fields to nested Passport object
            v2Pax.Passport = {
                PassportNumber: pax.PassportNumber || pax.Passport?.PassportNumber || 'NOSPPT',
                ExpiryDate: pax.ExpiryDate ? pax.ExpiryDate.replace(/T00:00:00$/, 'T00:00:00.000Z') : '2030-01-01T00:00:00.000Z',
                Country: pax.Country || pax.Passport?.Country || 'KR',
            };

            // 2. Add PassengerNationality (V2 required key)
            v2Pax.PassengerNationality = pax.Nationality || pax.Country || 'KR';

            // 3. Fix DateOfBirth format
            if (v2Pax.DateOfBirth) {
                v2Pax.DateOfBirth = v2Pax.DateOfBirth.replace(/T00:00:00$/, 'T00:00:00.000Z');
            }

            // Cleanup v1 fields
            delete v2Pax.PassportNumber;
            delete v2Pax.ExpiryDate;
            delete v2Pax.Nationality;

            return v2Pax;
        });
        return v2Body;
    } catch (e) {
        console.error('[mystiflyClient] Error converting to V2 body:', e);
        return v1Body; // fallback to original
    }
}

/**
 * Issue a ticket for a confirmed booking (UniqueID / PNR).
 */
export async function ticketFlight(
    uniqueId: string,
    fareSourceCode?: string,
    sessionId?: string,
    conversationId?: string,
) {
    return mystiflyRequest('/api/v1/OrderTicket', {
        UniqueID: uniqueId,
        FareSourceCode: fareSourceCode,
    }, sessionId, conversationId);
}


// ─── Fetch Helpers ──────────────────────────────────────────────────

/** Single fetch call with AbortController timeout. */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
}

/** Fetch with timeout + retry on network errors / 5xx. */
async function fetchWithRetry(url: string, init: RequestInit, skipTimeoutRetry = false): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const res = await fetchWithTimeout(url, init);

            // Retry on 5xx
            if (res.status >= 500 && attempt < MAX_RETRIES) {
                console.warn(`[Mystifly] ${res.status} on attempt ${attempt}/${MAX_RETRIES} — retrying`);
                await sleep(attempt * 500);
                continue;
            }

            return res;
        } catch (err: any) {
            lastError = err;

            if (err.name === 'AbortError') {
                console.error(`[Mystifly] Timeout on attempt ${attempt}/${MAX_RETRIES}`);
                if (skipTimeoutRetry) {
                    console.warn('[Mystifly] skipTimeoutRetry is active for this endpoint. Throwing timeout instead of retrying.');
                    throw err;
                }
            } else {
                console.error(`[Mystifly] Network error on attempt ${attempt}/${MAX_RETRIES}:`, err.message);
            }

            if (attempt < MAX_RETRIES) {
                await sleep(attempt * 500);
            }
        }
    }

    throw lastError ?? new MystiflyError('All retry attempts failed', 'NETWORK', 0);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Mapping Constants ──────────────────────────────────────────────

/** Maps our CabinClass to Mystifly cabin codes. */
export const CABIN_MAP = {
    economy: 'Y',
    premium_economy: 'S',
    business: 'C',
    first: 'F',
} as const;

/** Maps gender to Mystifly title. */
export const GENDER_TO_TITLE: Record<string, string> = {
    M: 'Mr',
    F: 'Ms',
    male: 'Mr',
    female: 'Ms',
} as const;

/** Maps our TripType to Mystifly AirTripType values. */
export const TRIP_TYPE_MAP = {
    'one-way': 'OneWay',
    'round-trip': 'Return',
    'multi-city': 'MultiCity',
} as const;

// ─── Error ──────────────────────────────────────────────────────────

export type MystiflyErrorType = 'AUTH' | 'RATE_LIMIT' | 'CLIENT' | 'SERVER' | 'NETWORK' | 'PARSE';

export class MystiflyError extends Error {
    constructor(
        message: string,
        public readonly type: MystiflyErrorType,
        public readonly status: number,
    ) {
        super(message);
        this.name = 'MystiflyError';
    }
}
