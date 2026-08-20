import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

/**
 * Clicking "Choose room" while signed out used to bounce the user to the landing
 * page: /checkout sat in the middleware's PROTECTED_PREFIXES, so a missing session
 * cookie triggered a redirect to "/" that also wiped the query string.
 *
 * Checkout is meant to be browsable signed out — prebook needs no session, and the
 * page gates at the payment step (auth modal + "Sign in to complete"). The real
 * enforcement is /api/booking/create-payment, which 401s without a session.
 */

const request = (path: string, { signedIn = false } = {}) => {
    const req = new NextRequest(new URL(path, 'https://cheapestgo.test'));
    if (signedIn) req.cookies.set('cg-session', 'session-id');
    return req;
};

const isRedirect = (res: Response) => res.status >= 300 && res.status < 400;

describe('signed-out access to checkout', () => {
    it('lets a signed-out user reach checkout', () => {
        const res = middleware(request('/checkout?currency=USD'));

        expect(isRedirect(res)).toBe(false);
        expect(res.headers.get('location')).toBeNull();
    });

    it('keeps letting a signed-in user through', () => {
        const res = middleware(request('/checkout?currency=USD', { signedIn: true }));

        expect(isRedirect(res)).toBe(false);
    });

    it('preserves the query string the room selection carries', () => {
        const res = middleware(request('/checkout?currency=KRW&adults=2'));

        // A redirect here would drop currency + guests along with the destination.
        expect(res.headers.get('location')).toBeNull();
    });
});

describe('admin stays guarded', () => {
    it('redirects a signed-out user to login', () => {
        const res = middleware(request('/admin'));

        expect(isRedirect(res)).toBe(true);
        expect(res.headers.get('location')).toContain('/login');
    });

    it('lets a session-cookie holder past the middleware', () => {
        // Role is checked server-side in the admin layout, not here.
        const res = middleware(request('/admin', { signedIn: true }));

        expect(isRedirect(res)).toBe(false);
    });
});
