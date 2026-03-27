'use client';

import dynamic from 'next/dynamic';
import type { Property } from '@/types';

// Mapbox GL (~100 kB) is only needed in map view.
// This Client Component wrapper allows `ssr: false` so list-view users
// never download the mapping library.
const SearchMapView = dynamic(
    () => import('./SearchMapView').then(m => ({ default: m.SearchMapView })),
    {
        ssr: false,
        loading: () => (
            <div className="flex h-full w-full bg-slate-100 dark:bg-slate-800 animate-pulse" />
        ),
    }
);

interface LazySearchMapViewProps {
    properties: Property[];
    destination?: string;
}

export default function LazySearchMapView(props: LazySearchMapViewProps) {
    return <SearchMapView {...props} />;
}
