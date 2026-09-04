import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rateLimit } from './rate-limit';

/**
 * These cover client identification, not the counting itself. The bug they exist to
 * prevent is the one QA hit: a key that names a proxy rather than a person, so unrelated
 * customers share one allowance — see ADR-0028.
 */

const ORIGINAL_DB_URL = process.env.DATABASE_URL;
const ORIGINAL_SECRET = process.env.CF_ORIGIN_SECRET;

/** A request as it reaches the app, with whatever headers we want to claim. */
function req(headers: Record<string, string>): Request {
    return new Request('https://cheapestgo.com/api/booking/prebook', { headers });
}

/** Distinct per test so the module-level in-memory store cannot leak counts between them. */
let n = 0;
const nextPrefix = () => `test-rl-${Date.now()}-${n++}`;

describe('rateLimit client identification', () => {
    beforeEach(() => {
        // Force the in-memory path: these assert on keying, not on the Postgres RPC.
        delete process.env.DATABASE_URL;
        process.env.CF_ORIGIN_SECRET = 'edge-secret';
        vi.spyOn(console, 'warn').mockImplementation(() => { });
    });

    afterEach(() => {
        if (ORIGINAL_DB_URL === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = ORIGINAL_DB_URL;
        if (ORIGINAL_SECRET === undefined) delete process.env.CF_ORIGIN_SECRET;
        else process.env.CF_ORIGIN_SECRET = ORIGINAL_SECRET;
        vi.restoreAllMocks();
    });

    it('gives two clients behind the same proxy separate allowances', async () => {
        const prefix = nextPrefix();
        const opts = { limit: 1, windowMs: 60_000, prefix };

        // Both arrive via the same edge — identical x-real-ip, different customers.
        const alice = req({ 'x-origin-auth': 'edge-secret', 'cf-connecting-ip': '203.0.113.7', 'x-real-ip': '172.68.1.1' });
        const bob = req({ 'x-origin-auth': 'edge-secret', 'cf-connecting-ip': '203.0.113.8', 'x-real-ip': '172.68.1.1' });

        expect((await rateLimit(alice, opts)).success).toBe(true);
        // Alice has used her single call. Bob must be unaffected.
        expect((await rateLimit(bob, opts)).success).toBe(true);
        // And Alice's second call is still refused.
        expect((await rateLimit(alice, opts)).success).toBe(false);
    });

    it('ignores cf-connecting-ip when the request cannot be proved to come from the edge', async () => {
        const prefix = nextPrefix();
        const opts = { limit: 1, windowMs: 60_000, prefix };

        // No x-origin-auth: this could be anyone addressing the origin directly, so a
        // self-declared address must not buy a private bucket.
        const forged = () => req({ 'cf-connecting-ip': `198.51.100.${n++}` });

        const first = await rateLimit(forged(), opts);
        expect(first.success).toBe(true);

        // Unidentified requests share the backstop bucket, which is far wider than the
        // route's own limit — so a handful of them are allowed...
        const results = await Promise.all(Array.from({ length: 10 }, () => rateLimit(forged(), opts)));
        expect(results.every(r => r.success)).toBe(true);

        // ...but the ceiling still exists.
        const flood = await Promise.all(Array.from({ length: 60 }, () => rateLimit(forged(), opts)));
        expect(flood.some(r => !r.success)).toBe(true);
    });

    it('prefers the user id over any header', async () => {
        const prefix = nextPrefix();
        const opts = { limit: 1, windowMs: 60_000, prefix, userId: 'user-1' };

        // Same user, addresses changing underneath them (mobile network, VPN, roaming).
        const fromHome = req({ 'x-origin-auth': 'edge-secret', 'cf-connecting-ip': '203.0.113.7' });
        const fromPhone = req({ 'x-origin-auth': 'edge-secret', 'cf-connecting-ip': '198.51.100.2' });

        expect((await rateLimit(fromHome, opts)).success).toBe(true);
        expect((await rateLimit(fromPhone, opts)).success).toBe(false);
    });

    it('does not let one user consume another user\'s allowance', async () => {
        const prefix = nextPrefix();
        const shared = req({ 'x-origin-auth': 'edge-secret', 'cf-connecting-ip': '203.0.113.9' });

        expect((await rateLimit(shared, { limit: 1, windowMs: 60_000, prefix, userId: 'user-a' })).success).toBe(true);
        expect((await rateLimit(shared, { limit: 1, windowMs: 60_000, prefix, userId: 'user-b' })).success).toBe(true);
        expect((await rateLimit(shared, { limit: 1, windowMs: 60_000, prefix, userId: 'user-a' })).success).toBe(false);
    });
});
