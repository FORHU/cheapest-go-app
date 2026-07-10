'use client';

import dynamic from 'next/dynamic';
import React from 'react';

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
}

const PropertyMapSidebar = React.memo((props: PropertyMapSidebarProps) => {
    return <PropertyMapSidebarContent {...props} />;
});

PropertyMapSidebar.displayName = 'PropertyMapSidebar';

export default PropertyMapSidebar;
