import { MetadataRoute } from 'next';

const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://cheapestgo.com').replace(/\/$/, '');
const NON_DEFAULT_LOCALES = ['ko', 'ja', 'zh'] as const;
const now = new Date();

function localeVariants(path: string, opts?: { changeFrequency?: MetadataRoute.Sitemap[number]['changeFrequency']; priority?: number }): MetadataRoute.Sitemap {
    const normalised = path === '/' ? '' : path;
    const base: MetadataRoute.Sitemap[number] = {
        url: `${baseUrl}${normalised || '/'}`,
        lastModified: now,
        changeFrequency: opts?.changeFrequency ?? 'weekly',
        priority: opts?.priority ?? 0.7,
    };
    return [
        base,
        ...NON_DEFAULT_LOCALES.map(locale => ({
            ...base,
            url: `${baseUrl}/${locale}${normalised || '/'}`,
        })),
    ];
}

export default function sitemap(): MetadataRoute.Sitemap {
    return [
        // ── Home ────────────────────────────────────────────────────────────────
        ...localeVariants('/', { changeFrequency: 'daily', priority: 1 }),

        // ── Deals ───────────────────────────────────────────────────────────────
        ...localeVariants('/deals', { changeFrequency: 'daily', priority: 0.9 }),

        // ── About ───────────────────────────────────────────────────────────────
        ...localeVariants('/about', { changeFrequency: 'monthly', priority: 0.6 }),

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
