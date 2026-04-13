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

    console.log(`[Mystifly] Request: ${BASE_URL()}${endpoint} | Target: ${finalBody.Target} | ConversationId: ${finalBody.ConversationId}`);

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
        // 404 with empty body is expected (e.g. TripDetails before booking is indexed)
        if (res.status === 404) {
            console.warn(`[Mystifly] 404 non-JSON from ${endpoint} — booking not indexed yet`);
        } else {
            console.error(`[Mystifly] Response was not JSON from ${endpoint} (HTTP ${res.status}). Raw body:`, snippet);
        }
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
    searchIdentifier?: string,
) {
    const target = getMystiflyTarget();
    const body: any = { FareSourceCode: fareSourceCode, Target: target };
    if (searchIdentifier) body.SearchIdentifier = searchIdentifier;

    // 1. Try V2 Revalidate/Flight
    try {
        console.log(`[mystiflyClient] V2 Revalidate (Revalidate/Flight). Target: ${target}`);
        return await mystiflyRequest('/api/v2/Revalidate/Flight', body, sessionId, conversationId);
    } catch (err: any) {
        const isFallthrough = err?.type === 'PARSE' || /version mismatch|searchidentifier|invalid faresource/i.test(err?.message ?? '');
        if (!isFallthrough) throw err;
        console.warn('[mystiflyClient] V2 Revalidate/Flight failed — trying OnePoint:', err.message);
    }

    // 2. Try V2 OnePoint/Revalidate
    try {
        console.log(`[mystiflyClient] V2 Revalidate (OnePoint). Target: ${target}`);
        return await mystiflyRequest('/api/v2/OnePoint/Revalidate', body, sessionId, conversationId);
    } catch (err: any) {
        const isFallthrough = err?.type === 'PARSE' || /version mismatch|searchidentifier|invalid faresource/i.test(err?.message ?? '');
        if (!isFallthrough) throw err;
        console.warn('[mystiflyClient] V2 OnePoint/Revalidate failed — falling back to V1:', err.message);
    }

    // 3. Final fallback: V1 Revalidate (FareSourceCodes work across versions)
    console.log(`[mystiflyClient] V1 Revalidate fallback for V2 fare. Target: ${target}`);
    return mystiflyRequest('/api/v1/Revalidate/Flight', body, sessionId, conversationId);
}

// ─── V1 Book ────────────────────────────────────────────────────────

/**
 * Book a V1 flight — V1 ONLY.
 * Tries WITH SearchIdentifier first (required by newer Mystifly API).
 * Falls back to WITHOUT SearchIdentifier if the API rejects the value
 * (ERBUK103 "API version mismatch" means wrong SearchIdentifier value).
 */
export async function bookFlight(
    body: any,
    sessionId?: string,
    conversationId?: string,
    searchIdentifier?: string,
) {
    const target = getMystiflyTarget();
    const baseUrl = BASE_URL();
    console.log(`[mystiflyClient] V1 Book. BASE_URL: ${baseUrl}, Target: ${target}, hasSearchId: ${!!searchIdentifier}`);

    const bookBodyWith: any = { ...body, Target: target };
    if (searchIdentifier) bookBodyWith.SearchIdentifier = searchIdentifier;

    const res = await mystiflyRequest('/api/v1/Book/Flight', bookBodyWith, sessionId, conversationId);

    // If the SearchIdentifier value we sent was rejected (ERBUK103 / "version mismatch"),
    // retry WITHOUT it. Mystifly sometimes returns this when the TraceId is passed instead
    // of a real SearchIdentifier.
    if (!res.Success && searchIdentifier) {
        const msg: string = res.Message ?? '';
        const isVersionMismatch = /version mismatch|invalid faresource/i.test(msg);
        if (isVersionMismatch) {
            console.warn(`[mystiflyClient] V1 Book: SearchIdentifier caused ERBUK103 — retrying WITHOUT it`);
            const bookBodyWithout: any = { ...body, Target: target };
            return mystiflyRequest('/api/v1/Book/Flight', bookBodyWithout, sessionId, conversationId);
        }
    }

    return res;
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
    searchIdentifier?: string,
) {
    const target = getMystiflyTarget();

    // Fall through to next endpoint on ANY failure — we're trying multiple endpoints
    // in order of preference, so any non-success should try the next one.
    const shouldFallThrough = (res: any) => !res.Success;

    // 1. Try V2 OnePoint/Book WITHOUT SearchIdentifier — this worked before the search migration.
    //    OnePoint is a simplified flow that may not require SearchIdentifier.
    try {
        console.log(`[mystiflyClient] V2 Book (OnePoint, no SearchId). Target: ${target}`);
        const v2Body = buildV2BookBody(v1StyleBody, target, undefined);
        const res = await mystiflyRequest('/api/v2/OnePoint/Book', v2Body, sessionId, conversationId);
        if (!shouldFallThrough(res)) {
            console.log('[mystiflyClient] V2 OnePoint/Book (no SearchId) succeeded');
            return res;
        }
        console.warn(`[mystiflyClient] V2 OnePoint/Book (no SearchId) failed: ${res.Message?.slice(0, 80)}`);
    } catch (err: any) {
        const isFallthrough = err?.type === 'PARSE' || /version mismatch|searchidentifier|invalid faresource/i.test(err?.message ?? '');
        if (!isFallthrough) throw err;
        console.warn('[mystiflyClient] V2 OnePoint/Book (no SearchId) failed, falling through:', err.message);
    }

    // 2. Try V2 OnePoint/Book WITH SearchIdentifier
    if (searchIdentifier) {
        try {
            console.log(`[mystiflyClient] V2 Book (OnePoint, with SearchId). Target: ${target}`);
            const v2Body = buildV2BookBody(v1StyleBody, target, searchIdentifier);
            const res = await mystiflyRequest('/api/v2/OnePoint/Book', v2Body, sessionId, conversationId);
            if (!shouldFallThrough(res)) {
                console.log('[mystiflyClient] V2 OnePoint/Book (with SearchId) succeeded');
                return res;
            }
            console.warn(`[mystiflyClient] V2 OnePoint/Book (with SearchId) failed: ${res.Message?.slice(0, 80)}`);
        } catch (err: any) {
            const isFallthrough = err?.type === 'PARSE' || /version mismatch|searchidentifier|invalid faresource/i.test(err?.message ?? '');
            if (!isFallthrough) throw err;
            console.warn('[mystiflyClient] V2 OnePoint/Book (with SearchId) failed, falling through:', err.message);
        }
    }

    // 3. Try V2 Book/Flight with SearchIdentifier
    try {
        console.log(`[mystiflyClient] V2 Book (Book/Flight). Target: ${target}`);
        const v2Body = buildV2BookBody(v1StyleBody, target, searchIdentifier);
        const res = await mystiflyRequest('/api/v2/Book/Flight', v2Body, sessionId, conversationId);
        if (!shouldFallThrough(res)) {
            console.log('[mystiflyClient] V2 Book/Flight succeeded');
            return res;
        }
        console.warn(`[mystiflyClient] V2 Book/Flight failed: ${res.Message?.slice(0, 80)}`);
    } catch (err: any) {
        const isFallthrough = err?.type === 'PARSE' || /version mismatch|searchidentifier|invalid faresource/i.test(err?.message ?? '');
        if (!isFallthrough) throw err;
        console.warn('[mystiflyClient] V2 Book/Flight failed, falling through to V1:', err.message);
    }

    // 4. Final fallback: V1 Book
    console.log(`[mystiflyClient] V1 Book fallback for V2 fare. Target: ${target}`);
    // V1 endpoint does not accept SearchIdentifier — sending it causes "API version mismatch"
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
function buildV2BookBody(v1Body: any, target: string, searchIdentifier?: string): any {
    if (!v1Body.TravelerInfo?.AirTravelers) return { ...v1Body, Target: target, ...(searchIdentifier ? { SearchIdentifier: searchIdentifier } : {}) };

    const v2Body = JSON.parse(JSON.stringify(v1Body)); // deep clone
    v2Body.Target = target;
    if (searchIdentifier) {
        v2Body.SearchIdentifier = searchIdentifier;
    }

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

// ─── VoidQuote ──────────────────────────────────────────────────────

/**
 * Get a void quote for a ticketed booking.
 * Returns refund amounts per passenger and the voiding window.
 * Endpoint: POST /api/PostTicketingRequest (ptrType: "VoidQuote")
 */
export async function voidQuote(
    mfRef: string,
    passengers: Array<{
        firstName: string;
        lastName: string;
        title: string;
        eTicket: string;
        passengerType: string;
    }>,
    sessionId?: string,
    conversationId?: string,
) {
    return mystiflyRequest('/api/PostTicketingRequest', {
        ptrType: 'VoidQuote',
        mFRef: mfRef,
        AllowChildPassenger: true,
        passengers: passengers.map(p => ({
            firstName: p.firstName,
            lastName: p.lastName,
            title: p.title,
            eTicket: p.eTicket,
            passengerType: p.passengerType,
        })),
    }, sessionId, conversationId);
}

// ─── Refund Quote ───────────────────────────────────────────────────

/**
 * Step 1 — Request a refund quote for a ticketed booking (post void-window).
 * Endpoint: POST /api/PostTicketingRequest (ptrType: "RefundQuote")
 * Returns a PTRId to use in subsequent GetQuote / AcceptRefund calls.
 */
export async function refundQuote(
    mfRef: string,
    passengers: Array<{
        firstName: string;
        lastName: string;
        title: string;
        eTicket: string;
        passengerType: string;
    }>,
    sessionId?: string,
    conversationId?: string,
) {
    return mystiflyRequest('/api/PostTicketingRequest', {
        ptrType: 'RefundQuote',
        mFRef: mfRef,
        passengers: passengers.map(p => ({
            firstName: p.firstName,
            lastName: p.lastName,
            title: p.title,
            eTicket: p.eTicket,
            passengerType: p.passengerType,
        })),
    }, sessionId, conversationId);
}

/**
 * Step 2 — Retrieve the refund quote details using PTRId from step 1.
 * Endpoint: POST /api/PostTicketingRequest (ptrType: "GetQuote")
 */
export async function getRefundQuote(
    ptrId: string,
    sessionId?: string,
    conversationId?: string,
) {
    return mystiflyRequest('/api/PostTicketingRequest', {
        ptrType: 'GetQuote',
        PTRId: ptrId,
    }, sessionId, conversationId);
}

/**
 * Step 2b — Execute the refund after reviewing the RefundQuote.
 * Same body structure as RefundQuote but ptrType: "Refund".
 * Endpoint: POST /api/PostTicketingRequest (ptrType: "Refund")
 */
export async function executeRefund(
    mfRef: string,
    passengers: Array<{
        firstName: string;
        lastName: string;
        title: string;
        eTicket: string;
        passengerType: string;
    }>,
    sessionId?: string,
    conversationId?: string,
) {
    return mystiflyRequest('/api/PostTicketingRequest', {
        ptrType: 'Refund',
        mFRef: mfRef,
        passengers: passengers.map(p => ({
            firstName: p.firstName,
            lastName: p.lastName,
            title: p.title,
            eTicket: p.eTicket,
            passengerType: p.passengerType,
        })),
    }, sessionId, conversationId);
}

// ─── Void ───────────────────────────────────────────────────────────

/**
 * Execute a void (refund) for a ticketed booking.
 * Same structure as VoidQuote but ptrType: "Void".
 * Endpoint: POST /api/PostTicketingRequest (ptrType: "Void")
 */
export async function voidBooking(
    mfRef: string,
    passengers: Array<{
        firstName: string;
        lastName: string;
        title: string;
        eTicket: string;
        passengerType: string;
    }>,
    sessionId?: string,
    conversationId?: string,
) {
    return mystiflyRequest('/api/PostTicketingRequest', {
        ptrType: 'Void',
        mFRef: mfRef,
        AllowChildPassenger: true,
        passengers: passengers.map(p => ({
            firstName: p.firstName,
            lastName: p.lastName,
            title: p.title,
            eTicket: p.eTicket,
            passengerType: p.passengerType,
        })),
    }, sessionId, conversationId);
}

// ─── Cancel Booking ─────────────────────────────────────────────────

/**
 * Cancel a confirmed Mystifly booking by UniqueID (MF+8 digits).
 * Endpoint: POST /api/v1/Booking/Cancel
 */
export async function cancelBooking(
    uniqueId: string,
    sessionId?: string,
    conversationId?: string,
) {
    return mystiflyRequest('/api/v1/Booking/Cancel', {
        UniqueID: uniqueId,
    }, sessionId, conversationId);
}

// ─── Booking Note ───────────────────────────────────────────────────

/**
 * Add one or more notes to an existing Mystifly booking.
 * UniqueID must start with MF followed by 8 digits.
 * Endpoint: POST /api/v1/BookingNotes
 */
export async function addBookingNote(
    uniqueId: string,
    notes: string[],
    sessionId?: string,
    conversationId?: string,
) {
    return mystiflyRequest('/api/v1/BookingNotes', {
        UniqueID: uniqueId,
        Notes: notes,
    }, sessionId, conversationId);
}

// ─── TripDetails ────────────────────────────────────────────────────

/**
 * GET request helper for Mystifly endpoints that use path params (e.g. TripDetails/{MfRef}).
 */
async function mystiflyGet<T = any>(
    endpoint: string,
    sessionId?: string,
): Promise<T> {
    let sid = sessionId ?? await createSession();
    const url = `${BASE_URL()}${endpoint}`;

    console.log(`[Mystifly] GET ${url}`);

    const buildInit = (s: string): RequestInit => ({
        method: 'GET',
        headers: { 'Authorization': `Bearer ${s}` },
    });

    let res = await fetchWithRetry(url, buildInit(sid), false);

    if (res.status === 401) {
        console.warn('[Mystifly] 401 on GET — refreshing session');
        clearSessionCache();
        sid = await createSession();
        res = await fetchWithRetry(url, buildInit(sid), false);
    }

    const text = await res.text();
    if (!text.trim()) {
        if (res.status === 404) {
            console.warn(`[Mystifly] 404 non-JSON from GET ${endpoint} — booking not indexed yet`);
        } else {
            console.error(`[Mystifly] Empty response from GET ${endpoint} (HTTP ${res.status})`);
        }
        throw new MystiflyError(`GET ${endpoint} returned HTTP ${res.status} with empty body`, 'PARSE', res.status);
    }

    let json: any;
    try {
        json = JSON.parse(text);
    } catch {
        console.error(`[Mystifly] Non-JSON from GET ${endpoint} (HTTP ${res.status}):`, text.slice(0, 200));
        throw new MystiflyError(`GET ${endpoint} returned non-JSON (HTTP ${res.status})`, 'PARSE', res.status);
    }

    if (!res.ok) {
        const detail = json?.Message ?? json?.error ?? text.slice(0, 300);
        throw new MystiflyError(`GET ${endpoint} → ${res.status}: ${detail}`, 'CLIENT', res.status);
    }

    return json as T;
}

/**
 * Retrieve full trip details for a confirmed booking.
 * Uses GET /api/v1/TripDetails/{MfRef} (MfRef in URL path).
 */
export async function getTripDetails(
    uniqueId: string,
    sessionId?: string,
    _conversationId?: string,
) {
    // Primary: GET /api/TripDetails/{MfRef} (no version prefix — confirmed from Swagger)
    try {
        return await mystiflyGet(`/api/TripDetails/${encodeURIComponent(uniqueId)}`, sessionId);
    } catch (err: any) {
        if (err?.status === 404) {
            // Fallback: GET /api/r1/TripDetails/{MfRef}
            return await mystiflyGet(`/api/r1/TripDetails/${encodeURIComponent(uniqueId)}`, sessionId);
        }
        throw err;
    }
}

// ─── FareRules ──────────────────────────────────────────────────────

/**
 * Retrieve fare rules for a given FareSourceCode.
 * FSC expires after ~20 minutes for pre-booking requests.
 * Endpoint: POST /api/v1/FlightFareRules
 */
export async function getFareRules(
    fareSourceCode: string,
    sessionId?: string,
    conversationId?: string,
) {
    return mystiflyRequest('/api/v1/FlightFareRules', {
        FareSourceCode: fareSourceCode,
    }, sessionId, conversationId);
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



export async function getTicketDisplay(mfRef: string, ticketNumber: string) {
    const sid = await createSession();
    const url = `${BASE_URL()}/api/Ticket/Details/${encodeURIComponent(mfRef)}/${encodeURIComponent(ticketNumber)}`;
    console.log(`[Mystifly] TicketDisplay GET: ${url}`);
    const res = await fetchWithRetry(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${sid}`,
            'Accept': 'application/json',
        },
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw Object.assign(new Error(`TicketDisplay HTTP ${res.status}: ${text.slice(0, 200)}`), { status: res.status });
    }
    return res.json();
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
