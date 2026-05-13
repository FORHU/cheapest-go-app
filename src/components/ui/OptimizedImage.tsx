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

"use client";

import { useState, useEffect } from 'react';
import Image from 'next/image';
import type { ImageProps } from 'next/image';

interface OptimizedImageProps extends Omit<ImageProps, 'src'> {
  src: string | null | undefined;
  fallbackSrc?: string;
  fallback?: React.ReactNode;
}

const DEFAULT_FALLBACK = 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800&h=600&fit=crop&q=80';

export function OptimizedImage({
  src,
  alt,
  fallbackSrc = DEFAULT_FALLBACK,
  fallback,
  ...props
}: OptimizedImageProps) {
  const [imgSrc, setImgSrc] = useState<string | null | undefined>(src);
  const [hasError, setHasError] = useState(false);

  // Reset error state if src changes
  useEffect(() => {
    setImgSrc(src);
    setHasError(false);
  }, [src]);

  // Handle null/undefined src
  if (!imgSrc) {
    return <>{fallback || <div className={props.className} />}</>;
  }

  return (
    <Image
      src={imgSrc}
      alt={alt}
      placeholder="blur"
      blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2YzZjRmNiIvPjwvc3ZnPg=="
      onError={() => {
        if (!hasError) {
          setImgSrc(fallbackSrc);
          setHasError(true);
        }
      }}
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
