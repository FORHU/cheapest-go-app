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
    it('on CheapestGo, names its own languages relatively and Korean at airanggo.com', () => {
        expect(hreflang('/about', UNLOCKED)).toEqual({
            en: '/about',
            ja: '/ja/about',
            zh: '/zh/about',
            ko: 'https://airanggo.com/about',
            'x-default': '/about',
        });
    });

    // AirangGo used to emit en/ja/zh alternates at its own domain, where those URLs render
    // Korean. They now point at the pages that actually serve those languages.
    it('on AirangGo, names Korean relatively and the rest at cheapestgo.com', () => {
        expect(hreflang('/about', AIRANGGO)).toEqual({
            en: 'https://cheapestgo.com/about',
            ja: 'https://cheapestgo.com/ja/about',
            zh: 'https://cheapestgo.com/zh/about',
            ko: '/about',
            'x-default': 'https://cheapestgo.com/about',
        });
    });

    it('shapes the home page without a trailing prefix slash', () => {
        expect(hreflang('/', AIRANGGO).ja).toBe('https://cheapestgo.com/ja');
        expect(hreflang('/', UNLOCKED).ko).toBe('https://airanggo.com/');
    });

    // The rule Google enforces: an alternate only counts if the page it names declares the
    // same set back. Resolved against each domain, both must say exactly the same thing.
    it('declares the identical set from both domains', () => {
        const resolve = (map: Record<string, string>, origin: string) =>
            Object.fromEntries(Object.entries(map).map(([l, url]) => [l, new URL(url, origin).href]));
        for (const path of ['/', '/about', '/property/sumaya-hotel--10000231']) {
            expect(resolve(hreflang(path, UNLOCKED), 'https://cheapestgo.com'))
                .toEqual(resolve(hreflang(path, AIRANGGO), 'https://airanggo.com'));
        }
    });
});
