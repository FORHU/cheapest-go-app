'use client';

import dynamic from 'next/dynamic';
import React from 'react';
import { useMediaQuery } from '@/hooks/useMediaQuery';

const PropertyMapSidebarContent = dynamic(
    () => import('./PropertyMapSidebarContent'),
    {
        ssr: false,
        loading: () => (
            <div className="h-full w-full rounded-xl overflow-hidden shadow-sm border border-slate-200/60 dark:border-white/10 bg-slate-100 dark:bg-slate-800 animate-pulse" />
        ),
    }
);

interface PropertyMapSidebarProps {
    hotelDetails?: {
        name?: string;
        description?: string;
        address?: string;
        city?: string;
        country?: string;
        image?: string;
    };
    coordinates?: { lat: number; lng: number };
    propertyName?: string;
    /**
     * The property page places this map twice — inline on phones, in the sticky side column
     * from `lg` — and used to hide the other copy with CSS only. Both copies still mounted:
     * two Mapbox maps (billed per load), two nearby-place searches and every place's details
     * fetched twice (QA BG-6). Each copy now mounts only at its own size. Client-only
     * (`ssr: false`), so the width is known on the first render and nothing flashes.
     */
    showAt?: 'below-lg' | 'lg-up';
}

const PropertyMapSidebar = React.memo(({ showAt, ...props }: PropertyMapSidebarProps) => {
    const isLg = useMediaQuery('(min-width: 1024px)');
    if (showAt === 'lg-up' && !isLg) return null;
    if (showAt === 'below-lg' && isLg) return null;
    return <PropertyMapSidebarContent {...props} />;
});

PropertyMapSidebar.displayName = 'PropertyMapSidebar';

export default PropertyMapSidebar;
