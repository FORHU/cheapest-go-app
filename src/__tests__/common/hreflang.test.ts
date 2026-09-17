import { describe, it, expect } from 'vitest';
import { canonicalPath, hreflang, localisedPath, servedLocalePaths } from '@/lib/seo/hreflang';

// `locked` is passed explicitly rather than through NEXT_PUBLIC_LOCALE, so these run
// without mutating process.env and can assert both deployment shapes in one file.
const UNLOCKED = null;
const AIRANGGO = 'ko';

describe('localisedPath', () => {
    it('leaves the default locale unprefixed', () => {
        expect(localisedPath('/about', 'en', UNLOCKED)).toBe('/about');
        expect(localisedPath('/', 'en', UNLOCKED)).toBe('/');
    });

    it('prefixes a non-default locale', () => {
        expect(localisedPath('/about', 'ja', UNLOCKED)).toBe('/ja/about');
    });

    it('does not leave a trailing slash on the prefixed home page', () => {
        expect(localisedPath('/', 'ja', UNLOCKED)).toBe('/ja');
    });

    it('never prefixes on a locked deployment, whatever locale is asked for', () => {
        expect(localisedPath('/about', 'ko', AIRANGGO)).toBe('/about');
        expect(localisedPath('/about', 'ja', AIRANGGO)).toBe('/about');
    });
});

describe('canonicalPath', () => {
    // The bug this guards: the canonical dropped the locale prefix, so /ja/about and
    // /zh/about both declared the English /about as canonical. Google reads that as
    // "these are the same page" and indexes only the English one.
    it('keeps the prefix of the locale the page is served under', () => {
        expect(canonicalPath('/about', 'ja', UNLOCKED)).toBe('/ja/about');
        expect(canonicalPath('/about', 'zh', UNLOCKED)).toBe('/zh/about');
        expect(canonicalPath('/about', 'en', UNLOCKED)).toBe('/about');
    });

    // /ko still answers until the redirect lands. Until then it names itself, because
    // naming the English page is what got it discarded rather than merely deprioritised.
    it('lets an unadvertised Korean page name itself, not the English page', () => {
        expect(canonicalPath('/about', 'ko', UNLOCKED)).toBe('/ko/about');
    });

    it('is unprefixed on a locked deployment, folding /ja/about onto /about', () => {
        expect(canonicalPath('/about', 'ja', AIRANGGO)).toBe('/about');
    });
});

describe('servedLocalePaths', () => {
    it('serves English, Japanese and Chinese when unlocked — never Korean', () => {
        expect(servedLocalePaths('/about', UNLOCKED)).toEqual([
            { locale: 'en', path: '/about' },
            { locale: 'ja', path: '/ja/about' },
            { locale: 'zh', path: '/zh/about' },
        ]);
    });

    it('serves only its own language, unprefixed, when locked', () => {
        expect(servedLocalePaths('/about', AIRANGGO)).toEqual([{ locale: 'ko', path: '/about' }]);
    });
});

describe('hreflang', () => {
    it('declares only the locales this deployment serves, plus x-default', () => {
        expect(hreflang('/about', UNLOCKED)).toEqual({
            en: '/about',
            ja: '/ja/about',
            zh: '/zh/about',
            'x-default': '/about',
        });
    });

    // AirangGo emitted alternates for en/ja/zh at its own domain, none of which it serves:
    // those URLs render Korean. One language has nothing to alternate with.
    it('declares nothing on a locked deployment', () => {
        expect(hreflang('/about', AIRANGGO)).toBeUndefined();
    });
});
