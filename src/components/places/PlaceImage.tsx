'use client';

import React from 'react';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';

interface PlaceImageProps {
    photoReference: string;
    maxWidth?: number;
    alt: string;
    className?: string;
}

/**
 * Lazily loads a Google Place Photo via our optimized backend route.
 * Renders a skeleton while the optimized URL is being derived/cached.
 */
export function PlaceImage({ photoReference, maxWidth = 400, alt, className = '' }: PlaceImageProps) {
    // 1. Fetch the optimized URL from our backend cache layer
    const { data, isLoading, error } = useQuery({
        queryKey: ['placePhotoUrl', photoReference, maxWidth],
        queryFn: async () => {
            const res = await fetch(`/api/place-photo?photo_reference=${photoReference}&maxwidth=${maxWidth}`);
            if (!res.ok) throw new Error('Failed to load image url');
            return res.json();
        },
        staleTime: Infinity, // Photo URLs don't change frequently, cache heavily
    });

    if (isLoading) {
        // Render Skeleton
        return (
            <div className={`animate-pulse bg-slate-200 dark:bg-slate-800 ${className}`} />
        );
    }

    if (error || !data?.url) {
        // Render Error/Fallback state
        return (
            <div className={`flex items-center justify-center bg-slate-100 dark:bg-slate-900 text-slate-400 text-xs ${className}`}>
                Image unavailable
            </div>
        );
    }

    // 2. Render actual image utilizing Next.js layout and optimization.
    // Unoptimized is set to true to ensure stability if the Supabase domain is not whitelisted in next.config.js
    return (
        <Image
            src={data.url}
            alt={alt}
            width={maxWidth}
            height={(maxWidth / 4) * 3} // Arbitrary 4:3 aspect ratio fallback for natural layouts
            className={`object-cover ${className}`}
            style={{ width: '100%', height: '100%' }}
            unoptimized 
            loading="lazy"
        />
    );
}
