'use client';

import dynamic from 'next/dynamic';

const PropertyMapSidebar = dynamic(
    () => import('./PropertyMapSidebar'),
    {
        ssr: false,
        loading: () => (
            <div className="h-full w-full bg-slate-100 dark:bg-slate-800 animate-pulse rounded-xl" />
        ),
    }
);

export default PropertyMapSidebar;
