'use client';

import dynamic from 'next/dynamic';
import React from 'react';

const PropertyMapSidebarContent = dynamic(
    () => import('./PropertyMapSidebarContent'),
    {
        ssr: false,
        loading: () => (
            <div className="h-full w-full flex flex-col rounded-xl overflow-hidden shadow-sm border border-slate-200/60 dark:border-white/10 relative bg-slate-50 dark:bg-slate-900 animate-pulse">
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-sm text-slate-500 font-medium">Loading map...</div>
                </div>
            </div>
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

export default function PropertyMapSidebar(props: PropertyMapSidebarProps) {
    return <PropertyMapSidebarContent {...props} />;
}
