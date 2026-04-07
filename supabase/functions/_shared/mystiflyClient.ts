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
 * Centralized Target resolver — single source of truth for BOTH V1 and V2.
 *
 * V1 search, V1 revalidate, V1 book all use this value.
 * V2 search, V2 revalidate, V2 book all use this value.
 * No per-function overrides. No cross-version switching.
 *
 * MYSTIFLY_ENV=production  → 'Production'
 * MYSTIFLY_ENV=test        → 'Test'
 * unset                    → 'Production' (safe default; preserves demo V1 behavior)
 */
export function getMystiflyTarget(): 'Production' | 'Test' {
    const envVal = env('MYSTIFLY_ENV', '').toLowerCase();
    return envVal === 'test' ? 'Test' : 'Production';
}

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

    // Use explicitly-passed Target, or fall back to centralized env resolver.
    // Callers MUST pass the correct Target — no cross-version override here.
    const target = body.Target ?? getMystiflyTarget();

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
        console.error(`[Mystifly] Response was not JSON from ${endpoint} (HTTP ${res.status}). Raw body:`, snippet);
        throw new MystiflyError(
            `Mystifly ${endpoint} returned HTTP ${res.status} with non-JSON body: ${snippet.slice(0, 80)}`,
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

    // No cross-version retry — FareSourceCode is version-locked.
    // If you see an API version mismatch here, the search and book are using
    // different providers (mystifly vs mystifly_v2). Check routing in create-booking.

    return json as T;
}

// ─── High-Level Operations ──────────────────────────────────────────

export { createSession };

// ─── V1 Search ───────────────────────────────────────────────────────

/**
 * Search flights via Mystifly v1 (ASHR 1.0).
 */
export async function searchFlights(
    body: any,
    sessionId?: string,
    conversationId?: string,
) {
    return mystiflyRequest('/api/v1/Search/Flight', body, sessionId, conversationId);
}

/**
 * Search flights via Mystifly v2 (Branded Fares).
 * Supports the highly normalized FlightFaresList schema.
 */
export async function searchBrandedFlights(
    body: any,
    sessionId?: string,
    conversationId?: string,
) {
    return mystiflyRequest('/api/v2/Search/Flight', body, sessionId, conversationId);
}

/**
 * Revalidate a fare using its FareSourceCode.
// ─── V1 Revalidate ──────────────────────────────────────────────────

/**
 * Revalidate a V1 FareSourceCode — V1 ONLY, no cross-version fallback.
 * Must only be called for flights obtained from mystifly (V1) search.
 * Uses the centralized getMystiflyTarget() target.
 */
export async function revalidateFare(
    fareSourceCode: string,
    sessionId?: string,
    conversationId?: string,
) {
    const target = getMystiflyTarget();
    console.log(`[mystiflyClient] V1 Revalidate. Target: ${target}`);
    return mystiflyRequest('/api/v1/Revalidate/Flight', {
        FareSourceCode: fareSourceCode,
        Target: target,
    }, sessionId, conversationId);
}

// ─── V2 Revalidate ──────────────────────────────────────────────────

/**
 * Revalidate a V2 FareSourceCode.
 * Must only be called for flights obtained from mystifly_v2 search.
 *
 * Tries V2 endpoints first, then falls back to V1 /api/v1/Revalidate/Flight
 * since FareSourceCodes are version-agnostic identifiers.
 */
export async function revalidateFareV2(
    fareSourceCode: string,
    sessionId?: string,
    conversationId?: string,
) {
    const target = getMystiflyTarget();
    const body = { FareSourceCode: fareSourceCode, Target: target };

    // 1. Try V2 Revalidate/Flight
    try {
        console.log(`[mystiflyClient] V2 Revalidate (Revalidate/Flight). Target: ${target}`);
        return await mystiflyRequest('/api/v2/Revalidate/Flight', body, sessionId, conversationId);
    } catch (err: any) {
        if (err?.type !== 'PARSE' && !err?.message?.includes('searchIdentifier')) throw err;
        console.warn('[mystiflyClient] V2 Revalidate/Flight failed or returned empty — trying OnePoint');
    }

    // 2. Try V2 OnePoint/Revalidate
    try {
        console.log(`[mystiflyClient] V2 Revalidate (OnePoint). Target: ${target}`);
        return await mystiflyRequest('/api/v2/OnePoint/Revalidate', body, sessionId, conversationId);
    } catch (err: any) {
        if (err?.type !== 'PARSE') throw err;
        console.warn('[mystiflyClient] V2 OnePoint/Revalidate also returned empty — falling back to V1');
    }

    // 3. Final fallback: V1 Revalidate (FareSourceCodes work across versions)
    console.log(`[mystiflyClient] V1 Revalidate fallback for V2 fare. Target: ${target}`);
    return mystiflyRequest('/api/v1/Revalidate/Flight', body, sessionId, conversationId);
}

// ─── V1 Book ────────────────────────────────────────────────────────

/**
 * Book a V1 flight — V1 ONLY, no cross-version retry.
 * Must only be called for flights obtained from mystifly (V1) search.
 * Uses the centralized getMystiflyTarget() target.
 */
export async function bookFlight(
    body: any,
    sessionId?: string,
    conversationId?: string,
) {
    const target = getMystiflyTarget();
    console.log(`[mystiflyClient] V1 Book. Target: ${target}`);
    return mystiflyRequest('/api/v1/Book/Flight', {
        ...body,
        Target: target,
    }, sessionId, conversationId);
}

// ─── V2 Book ────────────────────────────────────────────────────────

/**
 * Book a V2 flight.
 * Must only be called for flights obtained from mystifly_v2 search.
 * Converts V1-style flat body to V2 nested Passport format internally.
 *
 * Tries V2 endpoints first (/api/v2/OnePoint/Book, /api/v2/Book/Flight).
 * Falls back to V1 /api/v1/Book/Flight if V2 returns empty (PARSE error),
 * since FareSourceCodes are version-agnostic identifiers.
 */
export async function bookFlightV2(
    v1StyleBody: any,
    sessionId?: string,
    conversationId?: string,
) {
    const target = getMystiflyTarget();

    // Try V2 Book/Flight first
    try {
        console.log(`[mystiflyClient] V2 Book (Book/Flight). Target: ${target}`);
        const v2Body = buildV2BookBody(v1StyleBody, target);
        return await mystiflyRequest('/api/v2/Book/Flight', v2Body, sessionId, conversationId);
    } catch (err: any) {
        if (err?.type !== 'PARSE' && !err?.message?.includes('searchIdentifier')) throw err;
        console.warn('[mystiflyClient] V2 Book/Flight failed or returned empty — trying OnePoint');
    }

    // Try V2 OnePoint/Book
    try {
        console.log(`[mystiflyClient] V2 Book (OnePoint). Target: ${target}`);
        const v2Body = buildV2BookBody(v1StyleBody, target);
        return await mystiflyRequest('/api/v2/OnePoint/Book', v2Body, sessionId, conversationId);
    } catch (err: any) {
        if (err?.type !== 'PARSE') throw err;
        console.warn('[mystiflyClient] V2 OnePoint/Book also returned empty — falling back to V1 /api/v1/Book/Flight');
    }

    // Final fallback: V1 Book (FareSourceCodes work across versions)
    console.log(`[mystiflyClient] V1 Book fallback for V2 fare. Target: ${target}`);
    return mystiflyRequest('/api/v1/Book/Flight', {
        ...v1StyleBody,
        Target: target,
    }, sessionId, conversationId);
}

/**
 * Build V2 book request body from V1-style flat passenger data.
 * V2 requires:
 *   - Nested Passport: { PassportNumber, ExpiryDate, Country }
 *   - PassengerNationality field
 *   - DateOfBirth in .000Z format
 *   - No leftover flat V1 passport fields
 */
function buildV2BookBody(v1Body: any, target: string): any {
    if (!v1Body.TravelerInfo?.AirTravelers) return { ...v1Body, Target: target };

    const v2Body = JSON.parse(JSON.stringify(v1Body)); // deep clone
    v2Body.Target = target;

    v2Body.TravelerInfo.AirTravelers = v2Body.TravelerInfo.AirTravelers.map((pax: any) => {
        const v2Pax = { ...pax };

        // 1. Nest passport fields (V2 requires Passport object)
        v2Pax.Passport = {
            PassportNumber: pax.PassportNumber || 'NOSPPT',
            ExpiryDate: (pax.ExpiryDate ?? '2030-01-01T00:00:00')
                .replace(/T00:00:00$/, 'T00:00:00.000Z'),
            Country: pax.Country || 'KR',
        };

        // 2. PassengerNationality is required by V2
        v2Pax.PassengerNationality = pax.PassengerNationality || pax.Nationality || pax.Country || 'KR';

        // 3. DateOfBirth must be .000Z format
        if (v2Pax.DateOfBirth) {
            v2Pax.DateOfBirth = v2Pax.DateOfBirth.replace(/T00:00:00$/, 'T00:00:00.000Z');
        }

        // 4. Remove flat V1-only passport fields
        delete v2Pax.PassportNumber;
        delete v2Pax.ExpiryDate;
        delete v2Pax.Nationality; // V2 uses PassengerNationality

        return v2Pax;
    });

    return v2Body;
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
