import { MetadataRoute } from 'next';
import { servedLocalePaths } from '@/lib/seo/hreflang';

const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://cheapestgo.com').replace(/\/$/, '');
const now = new Date();

/**
 * One entry per locale this deployment actually serves — so AirangGo lists its Korean
 * pages only, and CheapestGo lists English, Japanese and Chinese.
 *
 * The served locales come from `@/lib/seo/hreflang`, the same list the pages build their
 * canonical and alternate URLs from. This file used to keep its own copy, which is how it
 * came to advertise a `/ko` that the pages no longer claimed.
 */
function localeVariants(path: string, opts?: { changeFrequency?: MetadataRoute.Sitemap[number]['changeFrequency']; priority?: number }): MetadataRoute.Sitemap {
    return servedLocalePaths(path).map(({ path: at }) => ({
        url: `${baseUrl}${at}`,
        lastModified: now,
        changeFrequency: opts?.changeFrequency ?? 'weekly',
        priority: opts?.priority ?? 0.7,
    }));
}

export default function sitemap(): MetadataRoute.Sitemap {
    return [
        // ── Home ────────────────────────────────────────────────────────────────
        ...localeVariants('/', { changeFrequency: 'daily', priority: 1 }),

        // ── Deals ───────────────────────────────────────────────────────────────
        ...localeVariants('/deals', { changeFrequency: 'daily', priority: 0.9 }),

        // ── About ───────────────────────────────────────────────────────────────
        ...localeVariants('/about', { changeFrequency: 'monthly', priority: 0.6 }),

        // ── Help ────────────────────────────────────────────────────────────────
        ...localeVariants('/help', { changeFrequency: 'monthly', priority: 0.5 }),

        // ── Legal ───────────────────────────────────────────────────────────────
        ...localeVariants('/terms-of-service',  { changeFrequency: 'monthly', priority: 0.4 }),
        ...localeVariants('/privacy-policy',    { changeFrequency: 'monthly', priority: 0.4 }),
        ...localeVariants('/refund-policy',     { changeFrequency: 'monthly', priority: 0.4 }),
        ...localeVariants('/cookie-policy',     { changeFrequency: 'monthly', priority: 0.4 }),

        // Destinations are deliberately absent. `/destinations/[slug]` resolves its
        // slug against the `popular_destinations` table, while this file built URLs
        // from the POPULAR_DESTINATIONS constant's `id` — two unrelated lists — so
        // every one of the 80 locale variants 404'd. The route 404s in production
        // for every slug form regardless, including cities the table does hold.
        // Restore only once it serves a 200, and take the slugs from whatever the
        // route resolves against, never from a second list.
    ];
}
