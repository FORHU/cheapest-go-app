# A language is served by exactly one domain

Korean is served only by `airanggo.com`, and English, Japanese and Chinese only by `cheapestgo.com`. Neither domain serves a language the other holds, so no two of our own URLs target the same query.

Both domains had been serving all four. `cheapestgo.com` published a sitemap of 108 URLs of which **81 were locale-prefixed**, `airanggo.com` published its own `/ko/`, `/ja/` and `/zh/`, and `geomeego.com` resolved to a byte-identical copy of the AirangGo site. Korean was therefore reachable at `cheapestgo.com/ko`, at `airanggo.com/`, and at `geomeego.com/` — three domains, one language, the same content from the same database. That is duplicate content between properties we own, and it splits the authority of a brand launched specifically to win Korean queries.

## Why not one site with locale prefixes

`cheapestgo.com/ko` as the single canonical Korean, with `airanggo.com` redirecting to it, is the cleaner answer in pure search terms: one domain accumulating authority, one sitemap, textbook `hreflang`, nothing to keep in step.

It was rejected because it discards the brand. AirangGo has its own name, logo, favicon, sending address and domain, chosen by the Korean partner — it is a market-facing identity, not a translation of CheapestGo. Redirecting it to an English brand's URL would keep the SEO and throw away the thing the SEO is for.

## Why not simply one language per domain

The naive reading — each domain serves the one language of its brand — leaves Japanese and Chinese with no home, since neither has a brand domain. They stay on `cheapestgo.com` under `/ja` and `/zh`, which already work. So the rule is that a language has exactly one home, not that a domain has exactly one language.

## Consequences

- **`cheapestgo.com/ko` must redirect rather than disappear.** It is in the sitemap today and may be indexed; a 301 to the AirangGo equivalent passes accumulated authority to the domain that now owns Korean. Removing it or letting it 404 discards that.
- **`geomeego.com` 301s to `airanggo.com`.** It is an exact duplicate of the Korean site and the most urgent of these, because it competes directly with the brand that just launched. The application still answers to the old name on purpose — see the note in the rename migration — so the redirect belongs at nginx, not in code.
- **`hreflang` becomes cross-domain.** `src/lib/seo/hreflang.ts` emits same-origin paths (`/ko/about`), which is wrong once Korean lives on another host: the Korean alternate is `https://airanggo.com/about`. It also emits all four locales from every page regardless of brand, which now over-claims on both domains.
- **Each brand's sitemap must list only its own territory.** AirangGo's currently advertises `/ja/` and `/zh/`, which it should not serve at all.
- **Locale prefixes do not currently switch language on AirangGo.** `airanggo.com/ja/about` returns `lang="ko"` and a title reading "About Us — CheapestGo" — wrong language, wrong brand. Under this decision that URL should not exist; the underlying brand leak is a separate defect and is not fixed by removing the route.
- **Metadata is where this is won or lost.** Of 29 storefront pages, 6 export a static English `metadata` object and 2 call `generateMetadata` without ever translating — among them `property/[id]`, which is one indexable page per hotel and therefore the whole long tail. A page can render in perfect Korean and still present an English title and description to Google, because those are the only two things a result shows.
