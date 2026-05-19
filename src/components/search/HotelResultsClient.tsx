'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { Property } from '@/types';
import SearchResults from './SearchResults';

interface HotelResultsClientProps {
    searchParams: Record<string, string>;
}

function HotelListSkeleton({ destination, elapsed }: { destination: string; elapsed: number }) {
    return (
        <div className="flex-1 min-w-0 animate-pulse">
            <div className="flex items-center justify-between mb-4 md:mb-6">
                <div className="space-y-2">
                    <div className="h-6 w-48 bg-slate-200 dark:bg-slate-700 rounded-lg" />
                    <p className="text-sm text-slate-500 dark:text-slate-400 animate-none!">
                        {destination ? `Searching hotels in ${destination}` : 'Searching…'}
                        {elapsed > 0 && (
                            <span className="ml-1 tabular-nums"> · {elapsed}s</span>
                        )}
                    </p>
                </div>
                <div className="h-9 w-36 bg-slate-200 dark:bg-slate-700 rounded-full" />
            </div>
            <div className="space-y-4">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex gap-4 h-44 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                        <div className="w-44 shrink-0 bg-slate-200 dark:bg-slate-700" />
                        <div className="flex-1 py-4 pr-4 space-y-3">
                            <div className="h-5 w-3/4 bg-slate-200 dark:bg-slate-700 rounded" />
                            <div className="h-4 w-1/3 bg-slate-200 dark:bg-slate-700 rounded" />
                            <div className="h-4 w-1/2 bg-slate-200 dark:bg-slate-700 rounded" />
                            <div className="flex items-end justify-between mt-auto pt-2">
                                <div className="h-8 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
                                <div className="h-9 w-28 bg-slate-200 dark:bg-slate-700 rounded-full" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function HotelResultsClient({ searchParams }: HotelResultsClientProps) {
    const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading');
    const [properties, setProperties] = useState<Property[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [queryParams, setQueryParams] = useState<Record<string, any>>(searchParams);
    const [elapsed, setElapsed] = useState(0);

    const destination = searchParams.destination || '';
    const searchKey = JSON.stringify(searchParams);

    useEffect(() => {
        let cancelled = false;
        setStatus('loading');
        setElapsed(0);

        const timer = setInterval(() => setElapsed(e => e + 1), 1000);

        fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(searchParams),
        })
            .then(r => r.json())
            .then(data => {
                if (cancelled) return;
                setProperties(data.properties || []);
                setTotalCount(data.totalCount || 0);
                setQueryParams(data.queryParams || searchParams);
                setStatus('done');
            })
            .catch(() => {
                if (!cancelled) setStatus('error');
            })
            .finally(() => clearInterval(timer));

        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [searchKey]);

    if (status === 'loading') {
        return <HotelListSkeleton destination={destination} elapsed={elapsed} />;
    }

    if (status === 'error') {
        return (
            <div className="flex-1 min-w-0 text-center py-20 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                <p className="text-slate-500 dark:text-slate-400 text-sm">Search failed. Please try again.</p>
            </div>
        );
    }

    return (
        <SearchResults
            initialProperties={properties}
            totalCount={totalCount}
            rawSearchParams={queryParams}
        />
    );
}
