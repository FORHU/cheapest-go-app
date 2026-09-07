import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { requireInternalSecret } from './internalAuth';

/**
 * /api/fn/travelgatex-book creates real hotel reservations on the live OTV access code, and
 * this check is the only thing between it and the open internet. It used to be four copies
 * of `if (!secret) return true` — an instance started without the variable served an
 * unauthenticated booking endpoint and looked entirely healthy.
 */
const req = (auth?: string) =>
    ({ headers: new Headers(auth ? { authorization: auth } : {}) }) as any;

const ORIGINAL = { ...process.env };
beforeEach(() => { delete process.env.FUNCTIONS_SECRET; delete process.env.INTERNAL_SECRET; });
afterEach(() => { process.env = { ...ORIGINAL }; });

describe('internal route auth', () => {
    it('refuses in production when no secret is configured', () => {
        // The regression that matters: a deploy that loses the variable must stop booking,
        // not start serving anonymous ones.
        process.env.NODE_ENV = 'production';
        const res = requireInternalSecret(req(), 'travelgatex-book');
        expect(res).not.toBeNull();
        expect(res!.status).toBe(503);
    });

    it('refuses in production even when the caller sends a bearer token', () => {
        process.env.NODE_ENV = 'production';
        expect(requireInternalSecret(req('Bearer anything'), 'travelgatex-book')).not.toBeNull();
    });

    it('allows an unconfigured development server through', () => {
        // Local work and the documented curl booking procedure both run without a secret,
        // and a dev server is not reachable from outside the machine.
        process.env.NODE_ENV = 'development';
        expect(requireInternalSecret(req(), 'travelgatex-book')).toBeNull();
    });

    it('accepts the matching bearer token', () => {
        process.env.NODE_ENV = 'production';
        process.env.FUNCTIONS_SECRET = 's3cret';
        expect(requireInternalSecret(req('Bearer s3cret'), 'travelgatex-book')).toBeNull();
    });

    it('rejects a wrong, absent or malformed token with 401', async () => {
        process.env.NODE_ENV = 'production';
        process.env.FUNCTIONS_SECRET = 's3cret';
        for (const header of [undefined, 'Bearer wrong', 's3cret', 'bearer s3cret']) {
            const res = requireInternalSecret(req(header), 'travelgatex-book');
            expect(res, String(header)).not.toBeNull();
            expect(res!.status, String(header)).toBe(401);
        }
    });

    it('falls back to INTERNAL_SECRET when FUNCTIONS_SECRET is absent', () => {
        process.env.NODE_ENV = 'production';
        process.env.INTERNAL_SECRET = 'other';
        expect(requireInternalSecret(req('Bearer other'), 'travelgatex-cancel')).toBeNull();
        expect(requireInternalSecret(req('Bearer nope'), 'travelgatex-cancel')).not.toBeNull();
    });
});
