/**
 * Optimized Image Component Template
 *
 * This component demonstrates how to use next/image for automatic optimization:
 * - Lazy loading with IntersectionObserver
 * - WebP/AVIF conversion
 * - Responsive srcsets
 * - Automatic sizing
 *
 * MIGRATION GUIDE:
 * Replace raw <img> tags with this component in:
 * - BookingCard.tsx (property thumbnails)
 * - PropertyCard.tsx (search results)
 * - PropertyGallery.tsx (property photos)
 * - Deal cards on landing page
 *
 * Example migration:
 *
 * BEFORE:
 * <img
 *   src={property.thumbnailUrl}
 *   alt={property.name}
 *   className="w-full h-48 object-cover"
 * />
 *
 * AFTER:
 * <OptimizedImage
 *   src={property.thumbnailUrl}
 *   alt={property.name}
 *   width={400}
 *   height={300}
 *   className="w-full h-48 object-cover"
 * />
 *
 * Benefits:
 * - ~60% smaller image sizes (WebP/AVIF)
 * - Faster page loads (lazy loading)
 * - Better Core Web Vitals (LCP, CLS)
 * - Automatic responsive images
 */

import Image from 'next/image';
import type { ImageProps } from 'next/image';

interface OptimizedImageProps extends Omit<ImageProps, 'src'> {
  src: string | null | undefined;
  fallback?: React.ReactNode;
}

export function OptimizedImage({
  src,
  alt,
  fallback,
  ...props
}: OptimizedImageProps) {
  // Handle null/undefined src
  if (!src) {
    return <>{fallback || <div className={props.className} />}</>;
  }

  // All HTTPS hosts are covered by the wildcard remotePatterns in next.config.mjs,
  // so next/image optimization (WebP/AVIF, srcset) is active for every external URL.
  return (
    <Image
      src={src}
      alt={alt}
      placeholder="blur"
      blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2YzZjRmNiIvPjwvc3ZnPg=="
      {...props}
    />
  );
}

/**
 * NOTE: To enable optimization for external images, add domains to next.config.mjs:
 *
 * images: {
 *   remotePatterns: [
 *     { protocol: "https", hostname: "static.cupid.travel" },
 *     { protocol: "https", hostname: "*.cupid.travel" },
 *     { protocol: "https", hostname: "api.liteapi.travel" }, // Add LiteAPI
 *     { protocol: "https", hostname: "*.amazonaws.com" },    // Add S3 if used
 *   ],
 * }
 */
