/**
 * Generates the `alternates.languages` block for Next.js generateMetadata.
 *
 * With localePrefix: 'as-needed', English (default) has no URL prefix,
 * while ko/ja/zh are served at /ko/*, /ja/*, /zh/*.
 *
 * Usage:
 *   alternates: {
 *     canonical: '/about',
 *     languages: hreflang('/about'),
 *   }
 */

const NON_DEFAULT_LOCALES = ['ko', 'ja', 'zh'] as const;

export function hreflang(path: string): Record<string, string> {
    const normalised = path.startsWith('/') ? path : `/${path}`;
    return {
        'en':        normalised,
        'ko':        `/ko${normalised === '/' ? '' : normalised}`,
        'ja':        `/ja${normalised === '/' ? '' : normalised}`,
        'zh':        `/zh${normalised === '/' ? '' : normalised}`,
        'x-default': normalised,
    };
}

/**
 * Convenience: returns both canonical and languages in one call.
 *
 *   alternates: hreflangAlternates('/about')
 */
export function hreflangAlternates(path: string) {
    const normalised = path.startsWith('/') ? path : `/${path}`;
    return {
        canonical: normalised,
        languages: hreflang(normalised),
    };
}

export { NON_DEFAULT_LOCALES };
