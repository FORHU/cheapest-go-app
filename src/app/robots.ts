import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://cheapestgo.com';

    return {
        rules: [
            {
                userAgent: '*',
                allow: '/',
                disallow: [
                    '/admin/',
                    '/api/',
                    '/auth/',
                    '/login',
                    '/account',
                    '/trips',
                    '/checkout',
                    '/booking/',
                    '/flights/book',
                ],
            },
        ],
        sitemap: `${baseUrl}/sitemap.xml`,
    };
}
