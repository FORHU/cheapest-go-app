import { describe, it, expect, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * checkCsrf()'s Origin/Referer fallback only ever allowed `localhost:3000` and
 * `127.0.0.1:3000` in development — hardcoded. `npm run dev` starts on 3000, but a second
 * dev server, a port already taken, or a manual `next dev -p 3001` all land on something
 * else, and every state-mutating request that relies on the fallback (rather than the
 * `X-Requested-By` header apiFetch() normally sends) then 403s with no clue why: same
 * machine, same browser, same app, just the "wrong" port. The primary check is unaffected
 * by any of this — this only ever concerns the fallback.
 *
 * ALLOWED_ORIGINS is a module-level `const` built once, from `process.env.NODE_ENV`, at
 * import time — so testing it at more than one NODE_ENV means re-importing the module
 * fresh under each one.
 */

async function freshCheckCsrf(nodeEnv: string) {
    vi.stubEnv('NODE_ENV', nodeEnv);
    vi.resetModules();
    const mod = await import('@/lib/server/csrf');
    return mod.checkCsrf;
}

function postFrom(origin: string) {
    // `origin` is a forbidden header name under the Fetch spec, so passing it in the
    // constructor's `headers` init is silently dropped (undici enforces this for a
    // Request's init-filled headers). Setting it on the Headers object after
    // construction is not subject to that check and is the only way to get it to stick.
    const req = new NextRequest('https://cheapestgo.test/api/booking/confirm', { method: 'POST' });
    req.headers.set('origin', origin);
    return req;
}

afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
});

describe('checkCsrf — Origin fallback, development', () => {
    it('accepts a dev server on a non-default port', async () => {
        const checkCsrf = await freshCheckCsrf('test');

        expect(checkCsrf(postFrom('http://localhost:3001'))).toBeNull();
    });

    it('accepts 127.0.0.1 on a non-default port too', async () => {
        const checkCsrf = await freshCheckCsrf('test');

        expect(checkCsrf(postFrom('http://127.0.0.1:5173'))).toBeNull();
    });

    it('still accepts the documented default port', async () => {
        // Not a regression test for a bug — a guard against the fix narrowing this by
        // accident while widening the rest.
        const checkCsrf = await freshCheckCsrf('test');

        expect(checkCsrf(postFrom('http://localhost:3000'))).toBeNull();
    });

    it('does not exempt a non-local origin just because NODE_ENV is not production', async () => {
        // The fix is "any port", not "any origin" — a dev-mode CSRF bypass for an actual
        // attacker's domain would be worse than the bug it replaces.
        const checkCsrf = await freshCheckCsrf('test');

        const res = checkCsrf(postFrom('https://evil.example.com'));
        expect(res?.status).toBe(403);
    });
});

describe('checkCsrf — Origin fallback, production', () => {
    it('does not accept localhost at all, regardless of port', async () => {
        const checkCsrf = await freshCheckCsrf('production');

        const res = checkCsrf(postFrom('http://localhost:3001'));
        expect(res?.status).toBe(403);
    });
});
