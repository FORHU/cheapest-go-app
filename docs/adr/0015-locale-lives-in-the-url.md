# The locale lives in the URL, not in a cookie

app-v2 selected its language from a `locale` cookie read in `src/i18n/request.ts`, with no `middleware.ts` and no `routing.ts`. It now uses v1's arrangement instead: `defineRouting({ locales: ['en','ko','ja','zh'], defaultLocale: 'en', localePrefix: 'as-needed' })` with next-intl middleware, so `/ko/property/123` is a real URL and every page is reachable per language. app-v2's `cn.json` is renamed `zh.json` to match: `zh` is the BCP-47 language subtag, while `cn` is the ISO-3166 country code for China, and next-intl, `hreflang`, and `Accept-Language` all expect the former.

We chose this while porting v1 into v2. Under the cookie model a single URL serves four languages, which means a link cannot carry a language, a search engine sees one page rather than four, and `hreflang` has nothing to point at. v1 had already built `src/lib/seo/hreflang.ts`, `sitemap.ts`, `robots.ts` and its structured data on top of URL-prefixed locales, so porting that work into the cookie model would have meant discarding it — and Phase 1's stated goal is a product competitive with Skyscanner, where per-language indexing in ko/ja/zh is commercial reach, not a technical preference.

## Consequences

- **Every `Link` and `useRouter` in app-v2 must use next-intl's navigation wrappers**, and each page moves under a `[locale]` segment. This is the bulk of slice F0 and the reason F0 runs before any other slice: doing it after the hotel slices would mean re-routing pages that had just been built.
- **`localePrefix: 'as-needed'` keeps English unprefixed**, so existing `/property/123` links stay valid and only ko/ja/zh gain a prefix.
- **GeomeeGo is unaffected.** Its Korean lock comes from `NEXT_PUBLIC_LOCALE` ([ADR-0005](0005-geomeego-white-label-deployment.md)), which works under either model.
- **The cookie is not reintroduced as a "remembered preference" shortcut.** A cookie that overrides the prefix makes a shared `/ko/...` link render in the recipient's language instead of the sender's, which is the defect this decision removes.
