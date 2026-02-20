/**
 * Amadeus API Client for Supabase Edge Functions (Deno).
 *
 * - OAuth2 client_credentials token with automatic refresh
 * - In-memory token cache with TTL buffer
 * - Timeout + retry for all HTTP calls
 * - Single entry point: amadeusRequest(endpoint, params?)
 *
 * Env vars (set in Supabase dashboard → Edge Function secrets):
 *   AMADEUS_API_KEY
 *   AMADEUS_API_SECRET
 *   AMADEUS_BASE_URL   (optional — defaults to production)
 */

declare const Deno: any;

// ─── Config ─────────────────────────────────────────────────────────

function env(key: string, fallback = ''): string {
    return Deno.env.get(key) ?? fallback;
}

const BASE_URL = () => env('AMADEUS_BASE_URL', 'https://api.amadeus.com');
const API_KEY = () => env('AMADEUS_API_KEY');
const API_SECRET = () => env('AMADEUS_API_SECRET');

const FETCH_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const TOKEN_REFRESH_BUFFER_MS = 60_000; // refresh 60s before expiry

// ─── Token Cache ────────────────────────────────────────────────────

interface TokenCache {
    accessToken: string;
    expiresAt: number; // epoch ms
}

let tokenCache: TokenCache | null = null;

/**
 * Obtain a valid OAuth2 access token.
 * Uses client_credentials grant. Cached in memory and auto-refreshed
 * 60 seconds before expiry to avoid mid-request failures.
 */
async function authenticate(): Promise<string> {
    if (tokenCache && Date.now() < tokenCache.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
        return tokenCache.accessToken;
    }

    const key = API_KEY();
    const secret = API_SECRET();

    if (!key || !secret) {
        throw new AmadeusError(
            'AMADEUS_API_KEY and AMADEUS_API_SECRET must be set',
            'AUTH',
            401,
        );
    }

    console.log('[Amadeus] Requesting OAuth2 token');

    const res = await fetchWithTimeout(
        `${BASE_URL()}/v1/security/oauth2/token`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: key,
                client_secret: secret,
            }),
        },
    );

    if (!res.ok) {
        const text = await res.text();
        tokenCache = null;
        throw new AmadeusError(
            `OAuth2 token request failed: ${res.status} ${text}`,
            'AUTH',
            res.status,
        );
    }

    const data = await res.json();

    if (!data.access_token) {
        throw new AmadeusError(
            'OAuth2 response missing access_token',
            'AUTH',
            500,
        );
    }

    tokenCache = {
        accessToken: data.access_token,
        expiresAt: Date.now() + (data.expires_in ?? 1799) * 1000,
    };

    console.log('[Amadeus] Token acquired, expires in', data.expires_in, 's');
    return tokenCache.accessToken;
}

/** Force-clear the token cache (e.g. on 401). */
export function clearTokenCache(): void {
    tokenCache = null;
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Make an authenticated request to any Amadeus API endpoint.
 *
 * - Automatically obtains/refreshes the OAuth2 token
 * - Retries once on 401 (token may have expired mid-flight)
 * - Retries on 5xx / network errors up to MAX_RETRIES
 * - Throws AmadeusError on all non-2xx final responses
 *
 * @param endpoint  - Path relative to base URL (e.g. "/v2/shopping/flight-offers")
 * @param options   - Optional: method, body, query params
 * @returns Parsed JSON response body
 *
 * @example
 *   // GET request
 *   const data = await amadeusRequest('/v1/reference-data/locations', {
 *       params: { keyword: 'ICN', subType: 'AIRPORT' },
 *   });
 *
 * @example
 *   // POST request
 *   const data = await amadeusRequest('/v2/shopping/flight-offers', {
 *       method: 'POST',
 *       body: { originDestinations: [...], travelers: [...] },
 *   });
 */
export async function amadeusRequest<T = any>(
    endpoint: string,
    options: {
        method?: 'GET' | 'POST';
        body?: Record<string, any>;
        params?: Record<string, string>;
    } = {},
): Promise<T> {
    const { method = 'GET', body, params } = options;

    let token = await authenticate();
    let url = `${BASE_URL()}${endpoint}`;

    // Append query params for GET
    if (params && Object.keys(params).length > 0) {
        const qs = new URLSearchParams(params).toString();
        url += `?${qs}`;
    }

    const buildHeaders = (t: string) => ({
        'Authorization': `Bearer ${t}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    });

    const buildInit = (t: string): RequestInit => ({
        method,
        headers: buildHeaders(t),
        ...(body && method === 'POST' ? { body: JSON.stringify(body) } : {}),
    });

    // ── First attempt ───────────────────────────────────────────────

    let res = await fetchWithRetry(url, buildInit(token));

    // ── Handle 401 — token may have expired, refresh once ───────────

    if (res.status === 401) {
        console.warn('[Amadeus] 401 received — refreshing token and retrying');
        clearTokenCache();
        token = await authenticate();
        res = await fetchWithRetry(url, buildInit(token));
    }

    // ── Handle 429 rate limit ───────────────────────────────────────

    if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        throw new AmadeusError(
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
        throw new AmadeusError(
            `Invalid JSON from Amadeus: ${text.slice(0, 200)}`,
            'PARSE',
            res.status,
        );
    }

    // ── Handle errors ───────────────────────────────────────────────

    if (!res.ok) {
        const detail =
            json?.errors?.[0]?.detail
            ?? json?.error_description
            ?? json?.message
            ?? text.slice(0, 300);

        throw new AmadeusError(
            `Amadeus ${method} ${endpoint} → ${res.status}: ${detail}`,
            res.status >= 500 ? 'SERVER' : 'CLIENT',
            res.status,
        );
    }

    return json as T;
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
                console.warn(`[Amadeus] ${res.status} on attempt ${attempt}/${MAX_RETRIES} — retrying`);
                await sleep(attempt * 500);
                continue;
            }

            return res;
        } catch (err: any) {
            lastError = err;

            if (err.name === 'AbortError') {
                console.error(`[Amadeus] Timeout on attempt ${attempt}/${MAX_RETRIES}`);
            } else {
                console.error(`[Amadeus] Network error on attempt ${attempt}/${MAX_RETRIES}:`, err.message);
            }

            if (attempt < MAX_RETRIES) {
                await sleep(attempt * 500);
            }
        }
    }

    throw lastError ?? new AmadeusError('All retry attempts failed', 'NETWORK', 0);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Error ──────────────────────────────────────────────────────────

export type AmadeusErrorType = 'AUTH' | 'RATE_LIMIT' | 'CLIENT' | 'SERVER' | 'NETWORK' | 'PARSE';

export class AmadeusError extends Error {
    constructor(
        message: string,
        public readonly type: AmadeusErrorType,
        public readonly status: number,
    ) {
        super(message);
        this.name = 'AmadeusError';
    }
}
