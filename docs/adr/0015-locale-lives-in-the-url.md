# The locale lives in the URL, not in a cookie

app-v2 selected its language from a `locale` cookie read in `src/i18n/request.ts`, with no `middleware.ts` and no `routing.ts`. It now puts the locale in the URL: `defineRouting({ locales: ['en','ko','ja','zh'], defaultLocale: 'en', localePrefix: 'as-needed' })`, every page under an `app/[locale]` segment, and next-intl's own middleware, so `/ko/property/123` is a real URL and every page is reachable per language. app-v2's `cn.json` is renamed `zh.json` to match: `zh` is the BCP-47 language subtag, while `cn` is the ISO-3166 country code for China, and next-intl, `hreflang`, and `Accept-Language` all expect the former.

We chose this while porting v1 into v2. Under the cookie model a single URL serves four languages, which means a link cannot carry a language, a search engine sees one page rather than four, and `hreflang` has nothing to point at. v1 had already built `src/lib/seo/hreflang.ts`, `sitemap.ts`, `robots.ts` and its structured data on top of URL-prefixed locales, so porting that work into the cookie model would have meant discarding it — and Phase 1's stated goal is a product competitive with Skyscanner, where per-language indexing in ko/ja/zh is commercial reach, not a technical preference.

## v2 does not copy v1's mechanism

This is the one place the port deliberately improves on v1 rather than reproducing it, so it is worth stating plainly for anyone comparing the two.

v1 also serves `/ko/...` URLs, but through a hand-written middleware that **rewrites** `/ko/search` to `/search` and passes the locale in an `X-NEXT-INTL-LOCALE` header. There is no `[locale]` segment and no navigation wrapper: internal `<Link>`s are unprefixed, and a `locale` cookie set by that middleware is what keeps the language as the visitor navigates. The consequence is that the language belongs to the *visitor*, not the *link* — click anything on `/ko/about` and you are on `/about`, reading Korean only because of a cookie. A crawler following the same link reads English.

v2 uses the `[locale]` segment instead, so the prefix survives internal navigation, no cookie is involved, and pages prerender per locale. The cost was moving 42 route files and swapping ~40 import lines; because next-intl's `Link`, `useRouter` and `usePathname` share the API of the originals, no call site changed.

The two therefore differ on URL shape during internal navigation. That is an intended divergence, not a porting defect, and a Side-by-side Check should not report it as one.

## Consequences

- **Navigation imports come from `@/i18n/navigation`, not `next/link` or `next/navigation`.** `useSearchParams`, `useParams` and `notFound` are not locale-aware and stay on `next/navigation`.
- **`/admin` sits outside the locale segment.** It is staff-facing and English-only, so it neither gains a prefix nor is rewritten into one — which also keeps 20 admin routes out of the migration. The locale middleware skips it and applies the session guard instead.
- **`robots.txt` and `sitemap.xml` must be excluded from the middleware matcher.** They are routes rather than files on disk, so without an explicit exclusion the locale middleware rewrites them into the segment and a crawler asking for `/robots.txt` is handed the rendered homepage.
- **An unknown prefix is a 404.** `/de/deals` does not quietly serve English under a German URL, which would put the same content at an address we do not publish.
- **`localePrefix: 'as-needed'` keeps English unprefixed**, so existing `/property/123` links stay valid and only ko/ja/zh gain a prefix.
- **GeomeeGo is unaffected.** Its Korean lock comes from `NEXT_PUBLIC_LOCALE` ([ADR-0005](0005-geomeego-white-label-deployment.md)), which works under either model.
- **The cookie is not reintroduced as a "remembered preference" shortcut.** A cookie that overrides the prefix makes a shared `/ko/...` link render in the recipient's language instead of the sender's, which is the defect this decision removes.
