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

const FETCH_TIMEOUT_MS = 20_000;
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
): Promise<T> {
    let sid = sessionId ?? await createSession();

    const url = `${BASE_URL()}${endpoint}`;

    const buildInit = (s: string): RequestInit => ({
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${s}`,
        },
        body: JSON.stringify(body),
    });

    // ── First attempt ───────────────────────────────────────────────

    let res = await fetchWithRetry(url, buildInit(sid));

    // ── Handle 401 — session may have expired, refresh once ─────────

    if (res.status === 401) {
        console.warn('[Mystifly] 401 received — refreshing session and retrying');
        clearSessionCache();
        sid = await createSession();
        res = await fetchWithRetry(url, buildInit(sid));
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
        throw new MystiflyError(
            `Invalid JSON from Mystifly: ${text.slice(0, 200)}`,
            'PARSE',
            res.status,
        );
    }

    // ── Handle HTTP errors ──────────────────────────────────────────

    if (!res.ok) {
        const detail = json?.Message ?? json?.error ?? text.slice(0, 300);
        throw new MystiflyError(
            `Mystifly POST ${endpoint} → ${res.status}: ${detail}`,
            res.status >= 500 ? 'SERVER' : 'CLIENT',
            res.status,
        );
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
    body: Record<string, any>,
    sessionId?: string,
) {
    return mystiflyRequest('/api/v1/Search/Flight', body, sessionId);
}

/**
 * Revalidate a fare to check current availability and pricing.
 */
export async function revalidateFare(
    fareSourceCode: string,
    sessionId?: string,
) {
    return mystiflyRequest('/api/v1/Revalidate/Flight', {
        FareSourceCode: fareSourceCode,
        Target: BASE_URL().includes('demo') ? 'Test' : 'Production',
    }, sessionId);
}

/**
 * Book a flight using a revalidated FareSourceCode.
 */
export async function bookFlight(
    body: Record<string, any>,
    sessionId?: string,
) {
    return mystiflyRequest('/api/v1/Book/Flight', body, sessionId);
}

/**
 * Issue a ticket for a confirmed booking (UniqueID / PNR).
 */
export async function ticketFlight(
    uniqueId: string,
    sessionId?: string,
) {
    return mystiflyRequest('/api/v1/Ticket/Flight', {
        UniqueID: uniqueId,
        Target: BASE_URL().includes('demo') ? 'Test' : 'Production',
    }, sessionId);
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
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
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
