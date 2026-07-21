import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://cheapestgo.com';

    return {
        rules: [
            {
                userAgent: '*',
                allow: '/',
                disallow: ['/admin/', '/api/', '/auth/callback', '/auth/reset-password', '/account', '/trips', '/checkout'],
            },
        ],
        sitemap: `${baseUrl}/sitemap.xml`,
    };
}
