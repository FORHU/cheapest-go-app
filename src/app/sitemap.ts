import { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://cheapestgo.com';

async function getDestinations(): Promise<{ city: string; country: string }[]> {
    try {
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        const { data } = await supabase
            .from('popular_destinations')
            .select('city, country')
            .limit(50);
        return data ?? [];
    } catch {
        return [];
    }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const now = new Date();
    const destinations = await getDestinations();

    const destinationUrls: MetadataRoute.Sitemap = destinations.map((d) => ({
        url: `${baseUrl}/search?destination=${encodeURIComponent(`${d.city}, ${d.country}`)}`,
        lastModified: now,
        changeFrequency: 'daily',
        priority: 0.8,
    }));

    return [
        {
            url: baseUrl,
            lastModified: now,
            changeFrequency: 'daily',
            priority: 1,
        },
        {
            url: `${baseUrl}/search`,
            lastModified: now,
            changeFrequency: 'daily',
            priority: 0.9,
        },
        {
            url: `${baseUrl}/flights`,
            lastModified: now,
            changeFrequency: 'daily',
            priority: 0.9,
        },
        {
            url: `${baseUrl}/trips`,
            lastModified: now,
            changeFrequency: 'weekly',
            priority: 0.5,
        },
        ...destinationUrls,
    ];
}
