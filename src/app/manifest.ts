import { MetadataRoute } from 'next';
import { canonicalBrandName } from '@/lib/brand';

/**
 * The installed-app identity.
 *
 * Every field here was a literal, so a traveller who added the site to their home screen
 * from another brand's domain got an app called CheapestGo with a CheapestGo icon. Verified
 * on 2026-09-07: serving as AirangGo, the page header read "AirangGo" and this manifest
 * still answered `"name":"CheapestGo"` — the header is brand-aware and this was not.
 *
 * The icon follows NEXT_PUBLIC_BRAND_FAVICON, which is what the browser tab already uses,
 * so the installed icon and the tab icon cannot disagree.
 */
export default function manifest(): MetadataRoute.Manifest {
  const brand = canonicalBrandName(process.env.NEXT_PUBLIC_BRAND_NAME);
  const icon = process.env.NEXT_PUBLIC_BRAND_FAVICON ?? '/cheapestgo-favico.png';

  return {
    name: brand,
    short_name: brand,
    // Names the brand rather than describing the category, so the install prompt and the
    // app listing say who this is.
    description: `Discover and book the cheapest flights and hotels globally with ${brand}.`,
    start_url: '/',
    display: 'standalone',
    background_color: '#020617',
    theme_color: '#020617',
    orientation: 'portrait',
    categories: ['travel', 'shopping'],
    icons: [
      {
        src: icon,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: icon,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
