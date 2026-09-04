/**
 * Rate limiter — PostgreSQL-backed with in-memory fallback.
 *
 * Counters are stored in the rate_limit_counters table via the
 * increment_rate_limit RPC. This survives cold-starts and is shared
 * across all running instances.
 *
 * Falls back to a per-process Map when the DB is unreachable.
 *
 * Usage:
 *   const result = await rateLimit(req, { limit: 10, windowMs: 60_000 });
 *   if (!result.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
 */

// ── In-memory fallback store ─────────────────────────────────────────────────
interface RateLimitEntry {
    count: number;
    resetAt: number;
}

const store = new Map<string, RateLimitEntry>();
let lastPurge = Date.now();

function maybePurge() {
    const now = Date.now();
    if (now - lastPurge < 5 * 60 * 1000) return;
    lastPurge = now;
    for (const [key, entry] of store) {
        if (entry.resetAt < now) store.delete(key);
    }
}

function inMemoryRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
    maybePurge();
    const now = Date.now();
    const entry = store.get(key);
    if (!entry || entry.resetAt < now) {
        store.set(key, { count: 1, resetAt: now + windowMs });
        return { success: true, remaining: limit - 1, resetAt: now + windowMs };
    }
    entry.count += 1;
    return {
        success: entry.count <= limit,
        remaining: Math.max(0, limit - entry.count),
        resetAt: entry.resetAt,
    };
}

// ── PostgreSQL RPC helper ────────────────────────────────────────────────────
async function postgresRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const { getSqlAdmin } = await import('@/lib/db/postgres');
    const sql = getSqlAdmin();

    const rows = await sql`
        SELECT current_count, reset_at
        FROM increment_rate_limit(${key}, ${windowMs}::bigint)
    `;

    const row = rows[0];
    if (!row) throw new Error('increment_rate_limit returned no rows');

    const count: number = Number(row.current_count);
    const resetAt = new Date(row.reset_at).getTime();

    return {
        success: count <= limit,
        remaining: Math.max(0, limit - count),
        resetAt,
    };
}

// ── Public API ───────────────────────────────────────────────────────────────
export interface RateLimitOptions {
    limit: number;
    windowMs?: number;
    prefix?: string;
    /**
     * When provided the rate limit key is scoped to this user ID instead of IP.
     * Use for authenticated endpoints — prevents IP-spoofing bypasses and gives
     * per-user quotas which are more meaningful than per-IP on shared networks.
     */
    userId?: string;
}

export interface RateLimitResult {
    success: boolean;
    remaining: number;
    resetAt: number;
}

/**
 * Derive a stable client identifier for anonymous rate limiting.
 *
 * The site is served through Cloudflare, so the only header that names the *client*
 * is `cf-connecting-ip`. `x-real-ip` names whatever proxy last handled the request —
 * on this deployment that is the TLS terminator in front of the container, so it
 * carries a Cloudflare edge address, not a customer. Keying on it put every visitor
 * arriving through the same Cloudflare PoP into one bucket: with most traffic landing
 * on one or two PoPs, a 5/min payment limit became 5/min for the entire country. The
 * previous comment described Vercel, which this has not run on for some time.
 *
 * `cf-connecting-ip` is only believable if the request actually came through
 * Cloudflare, because anything reaching the origin directly can invent it. That is
 * proved by CF_ORIGIN_SECRET — a value added by a Cloudflare Transform Rule and known
 * only to the edge. Without the secret configured we do not trust the header.
 *
 * Returns null when no client can be identified, which is deliberately different from
 * a shared bucket: see `rateLimit`.
 */
function getClientKey(req: Request): string | null {
    const headers = (req as any).headers;
    const get = (name: string): string => headers?.get?.(name) ?? '';

    const originSecret = process.env.CF_ORIGIN_SECRET;
    const fromCloudflare = !!originSecret && get('x-origin-auth').trim() === originSecret;

    if (fromCloudflare) {
        const cfIp = get('cf-connecting-ip').trim();
        if (cfIp) return cfIp;

        // Cloudflare sets X-Forwarded-For to the client, appending rather than
        // replacing, so the leftmost entry is the client it saw. Only readable once
        // we know the request came through the edge — otherwise it is caller-supplied.
        const forwarded = get('x-forwarded-for');
        const first = forwarded.split(',')[0]?.trim();
        if (first) return first;
    }

    return null;
}

/**
 * How much slack the shared backstop bucket gets when no individual client can be
 * identified. It has to be wide enough that ordinary traffic never reaches it — every
 * unidentified visitor counts against the same key — while still capping a flood
 * against endpoints that cost money per call.
 */
const UNIDENTIFIED_MULTIPLIER = 50;

let warnedUnidentified = false;

export async function rateLimit(
    req: Request,
    options: RateLimitOptions,
): Promise<RateLimitResult> {
    const { limit, windowMs = 60_000, prefix = 'rl', userId } = options;

    // Authenticated routes key on user ID — immune to spoofing, and unaffected by
    // whatever the edge does or does not tell us about addresses.
    const clientId = userId ?? getClientKey(req);

    if (!clientId) {
        // No identifiable client. Sharing one bucket at the route's own limit is what
        // used to happen by accident, and it throttles unrelated customers together —
        // so the shared bucket exists only as a flood backstop, at a much wider limit.
        if (!warnedUnidentified) {
            warnedUnidentified = true;
            console.warn(
                '[rate-limit] No client identity available — falling back to the shared backstop bucket. ' +
                'Set CF_ORIGIN_SECRET and the matching Cloudflare Transform Rule to restore per-client limits.',
            );
        }
        return runLimit(`${prefix}:unidentified`, limit * UNIDENTIFIED_MULTIPLIER, windowMs);
    }

    return runLimit(`${prefix}:${clientId}`, limit, windowMs);
}

async function runLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    if (process.env.DATABASE_URL) {
        try {
            return await postgresRateLimit(key, limit, windowMs);
        } catch (err) {
            console.warn('[rate-limit] Postgres unavailable, falling back to in-memory:', (err as Error).message);
        }
    }

    return inMemoryRateLimit(key, limit, windowMs);
}
