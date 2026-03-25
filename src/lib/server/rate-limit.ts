/**
 * In-memory rate limiter.
 *
 * NOTE: This implementation is per-process. On serverless platforms (Vercel)
 * each cold-start gets a fresh counter. For stricter enforcement, replace
 * the store with an Upstash Redis / Vercel KV client.
 *
 * Usage:
 *   const result = rateLimit(req, { limit: 10, windowMs: 60_000 });
 *   if (!result.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
 */

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Purge stale entries every 5 minutes to prevent unbounded memory growth
let lastPurge = Date.now();
function maybePurge() {
    const now = Date.now();
    if (now - lastPurge < 5 * 60 * 1000) return;
    lastPurge = now;
    for (const [key, entry] of store) {
        if (entry.resetAt < now) store.delete(key);
    }
}

export interface RateLimitOptions {
    /** Maximum number of requests allowed in the window */
    limit: number;
    /** Window duration in milliseconds (default: 60 000ms = 1 minute) */
    windowMs?: number;
    /** Optional namespace prefix to avoid key collisions between endpoints */
    prefix?: string;
}

export interface RateLimitResult {
    success: boolean;
    /** Requests remaining in the current window */
    remaining: number;
    /** Epoch ms when the window resets */
    resetAt: number;
}

/**
 * Extract a stable identifier from the request (IP or forwarded IP).
 */
function getClientKey(req: Request): string {
    // Next.js / Vercel sets x-forwarded-for
    const forwarded = (req as any).headers?.get?.('x-forwarded-for') ?? '';
    const ip = (forwarded as string).split(',')[0].trim() || 'unknown';
    return ip;
}

export function rateLimit(
    req: Request,
    options: RateLimitOptions,
): RateLimitResult {
    maybePurge();

    const { limit, windowMs = 60_000, prefix = 'rl' } = options;
    const now = Date.now();
    const clientKey = getClientKey(req);
    const key = `${prefix}:${clientKey}`;

    const entry = store.get(key);

    if (!entry || entry.resetAt < now) {
        // New window
        store.set(key, { count: 1, resetAt: now + windowMs });
        return { success: true, remaining: limit - 1, resetAt: now + windowMs };
    }

    entry.count += 1;
    const remaining = Math.max(0, limit - entry.count);

    return {
        success: entry.count <= limit,
        remaining,
        resetAt: entry.resetAt,
    };
}
