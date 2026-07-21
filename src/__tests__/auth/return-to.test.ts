/**
 * `safeReturnTo` guards a post-login redirect, so it is an open-redirect
 * surface: anything it lets through is somewhere an attacker can send a
 * freshly-authenticated user via a crafted `?next=` link.
 */
import { describe, it, expect } from 'vitest';
import { safeReturnTo, readReturnTo, loginUrlFor } from '@/lib/auth/returnTo';

describe('safeReturnTo', () => {
    it('keeps same-origin paths, including query strings', () => {
        expect(safeReturnTo('/flights/book')).toBe('/flights/book');
        expect(safeReturnTo('/flights/book?bundleHotelId=42')).toBe('/flights/book?bundleHotelId=42');
        expect(safeReturnTo('/trips/abc-123')).toBe('/trips/abc-123');
    });

    it('rejects off-site destinations', () => {
        expect(safeReturnTo('https://evil.com')).toBe('/');
        expect(safeReturnTo('http://evil.com')).toBe('/');
        // Protocol-relative — the browser reads this as an absolute URL.
        expect(safeReturnTo('//evil.com')).toBe('/');
        // Some browsers normalise backslashes to forward slashes.
        expect(safeReturnTo('/\\evil.com')).toBe('/');
        expect(safeReturnTo('/foo\\bar')).toBe('/');
        expect(safeReturnTo('javascript:alert(1)')).toBe('/');
    });

    it('falls back for empty input', () => {
        expect(safeReturnTo(null)).toBe('/');
        expect(safeReturnTo(undefined)).toBe('/');
        expect(safeReturnTo('')).toBe('/');
    });

    it('refuses to bounce back into the auth pages', () => {
        expect(safeReturnTo('/login')).toBe('/');
        expect(safeReturnTo('/login?next=/login')).toBe('/');
        expect(safeReturnTo('/auth/callback')).toBe('/');
    });

    it('honours a caller-supplied fallback', () => {
        expect(safeReturnTo(null, '/trips')).toBe('/trips');
        expect(safeReturnTo('https://evil.com', '/trips')).toBe('/trips');
    });
});

describe('readReturnTo', () => {
    const params = (qs: string) => new URLSearchParams(qs);

    it('reads the canonical `next` param', () => {
        expect(readReturnTo(params('next=/flights/book'))).toBe('/flights/book');
    });

    it('still accepts the legacy `redirect` param', () => {
        expect(readReturnTo(params('redirect=/account'))).toBe('/account');
    });

    it('prefers `next` when both are present', () => {
        expect(readReturnTo(params('next=/trips&redirect=/account'))).toBe('/trips');
    });

    it('validates whatever it reads', () => {
        expect(readReturnTo(params('next=https://evil.com'))).toBe('/');
    });

    it('uses the fallback when no param is present', () => {
        expect(readReturnTo(params(''), '/flights/book')).toBe('/flights/book');
        expect(readReturnTo(null, '/flights/book')).toBe('/flights/book');
    });
});

describe('loginUrlFor', () => {
    it('encodes the return path', () => {
        expect(loginUrlFor('/flights/book?bundleHotelId=42'))
            .toBe('/login?next=%2Fflights%2Fbook%3FbundleHotelId%3D42');
    });

    it('omits the param when there is nowhere meaningful to return to', () => {
        expect(loginUrlFor('/')).toBe('/login');
        expect(loginUrlFor('https://evil.com')).toBe('/login');
    });
});
