import { MetadataRoute } from 'next';
import { POPULAR_DESTINATIONS } from '@/lib/constants/destinations';

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

        // ── Destinations ────────────────────────────────────────────────────────
        ...POPULAR_DESTINATIONS.flatMap(dest =>
            localeVariants(`/destinations/${dest.id}`, { changeFrequency: 'weekly', priority: 0.8 })
        ),
    ];
}
