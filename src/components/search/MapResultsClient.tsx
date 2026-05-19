'use client';

import React, { useEffect, useState } from 'react';
import type { Property } from '@/types';
import LazySearchMapView from './LazySearchMapView';

interface MapResultsClientProps {
    searchParams: Record<string, string>;
    destination: string;
}

const STEPS = [
    'Connecting to suppliers',
    'Fetching availability',
    'Finding best prices',
    'Loading hotel details',
] as const;

// Timings (ms) at which each step completes and the next begins.
// Last step ("Loading hotel details") intentionally has no timer — it stays
// spinning until the component unmounts when the first hotels chunk arrives.
const STEP_TIMINGS = [1200, 3500, 7000];

function SearchProgressState({ destination, isDone }: { destination: string; isDone?: boolean }) {
    const [step, setStep]         = useState(0);
    const [progress, setProgress] = useState(4);

    useEffect(() => {
        const timers = STEP_TIMINGS.map((delay, i) =>
            setTimeout(() => setStep(i + 1), delay)
        );
        return () => timers.forEach(clearTimeout);
    }, []);

    useEffect(() => {
        const start = Date.now();
        const id = setInterval(() => {
            const elapsed = Date.now() - start;
            const p = Math.min(90, Math.round(88 * (1 - Math.exp(-elapsed / 9000))));
            setProgress(p);
        }, 80);
        return () => clearInterval(id);
    }, []);

    // When data arrives, snap all steps complete and fill bar to 100%
    useEffect(() => {
        if (!isDone) return;
        setStep(STEPS.length);
        setProgress(100);
    }, [isDone]);

    return (
        <div className="flex flex-col h-full w-full">
            {/* Skeleton toolbar */}
            <div className="shrink-0 h-[50px] bg-white dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 flex items-center px-4 gap-3">
                <div className="h-4 w-10 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />
                <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                <div className="ml-auto flex gap-1.5">
                    {[60, 52, 52, 68, 76, 52].map((w, i) => (
                        <div key={i} className="h-6 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse" style={{ width: w }} />
                    ))}
                </div>
            </div>

            {/* Main content */}
            <div className="flex-1 bg-slate-50 dark:bg-slate-900 flex">
                {/* Left panel: progress card */}
                <div className="flex items-center justify-center w-full md:w-[380px] shrink-0 px-8">
                    <div className="w-full max-w-[280px] select-none">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-0.5">
                            {destination ? `Searching hotels in ${destination}` : 'Searching hotels'}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
                            First results appear in a few seconds
                        </p>

                        {/* Progress bar */}
                        <div className="h-1 bg-slate-200 dark:bg-slate-700 rounded-full mb-5 overflow-hidden">
                            <div
                                className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out"
                                style={{ width: `${progress}%` }}
                            />
                        </div>

                        {/* Steps */}
                        <div className="flex flex-col gap-3">
                            {STEPS.map((label, i) => {
                                const done    = i < step;
                                const current = i === step;
                                return (
                                    <div key={i} className="flex items-center gap-2.5">
                                        <span className="w-4 shrink-0 text-center text-xs leading-none">
                                            {done
                                                ? <span className="text-emerald-500 font-bold">✓</span>
                                                : current
                                                    ? <span className="inline-block w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                                                    : <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600 mx-auto" />
                                            }
                                        </span>
                                        <span className={
                                            done
                                                ? 'text-xs text-slate-400 dark:text-slate-500'
                                                : current
                                                    ? 'text-xs font-medium text-slate-700 dark:text-slate-200'
                                                    : 'text-xs text-slate-300 dark:text-slate-600'
                                        }>
                                            {label}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Skeleton hotel cards */}
                        <div className="mt-8 flex flex-col gap-3">
                            {[1, 2, 3].map(n => (
                                <div key={n} className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800 p-3 flex gap-3 animate-pulse">
                                    <div className="w-16 h-16 rounded-lg bg-slate-200 dark:bg-slate-700 shrink-0" />
                                    <div className="flex-1 flex flex-col gap-2 py-1">
                                        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
                                        <div className="h-2.5 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
                                        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mt-auto" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right panel: skeleton map */}
                <div className="hidden md:block flex-1 bg-slate-200 dark:bg-slate-800 relative overflow-hidden">
                    <div className="absolute inset-0 bg-linear-to-br from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 animate-pulse" />
                    {/* Fake map pins */}
                    {[
                        { top: '38%', left: '45%' }, { top: '55%', left: '60%' },
                        { top: '30%', left: '65%' }, { top: '65%', left: '40%' },
                        { top: '48%', left: '30%' },
                    ].map((pos, i) => (
                        <div
                            key={i}
                            className="absolute w-12 h-6 rounded-full bg-white/70 dark:bg-slate-600/70 shadow animate-pulse"
                            style={{ top: pos.top, left: pos.left, animationDelay: `${i * 150}ms` }}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

function StreamingBanner({ count }: { count: number }) {
    return (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
            <div className="flex items-center gap-2 bg-white dark:bg-slate-800 shadow-lg rounded-full px-3.5 py-1.5 border border-slate-100 dark:border-slate-700 text-xs whitespace-nowrap">
                <span className="w-3 h-3 rounded-full border-[1.5px] border-blue-500 border-t-transparent animate-spin shrink-0" />
                <span className="text-slate-600 dark:text-slate-300">
                    Loading more hotels{count > 0 ? <> &middot; <strong className="text-slate-800 dark:text-slate-100">{count}</strong> found</> : ''}…
                </span>
            </div>
        </div>
    );
}

export function MapResultsClient({ searchParams, destination }: MapResultsClientProps) {
    const [status, setStatus]         = useState<'loading' | 'completing' | 'streaming' | 'done' | 'error'>('loading');
    const [properties, setProperties] = useState<Property[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [allMappable, setAllMappable] = useState<any[]>([]);
    const [queryParams, setQueryParams] = useState<Record<string, any>>(searchParams);

    const searchKey = JSON.stringify(searchParams);

    useEffect(() => {
        let cancelled = false;
        setStatus('loading');
        setProperties([]);
        setTotalCount(0);
        setAllMappable([]);

        const normalize = (h: any) => ({ ...h, id: h.id ?? h.hotelId, image: h.thumbnailUrl || h.image || '' });

        const run = async () => {
            // Normalize URL param names to match the edge function's expected keys
            const normalizedParams: Record<string, string> = { ...searchParams };
            // checkin / checkout
            if (!normalizedParams.checkin  && normalizedParams.checkIn)  { normalizedParams.checkin  = normalizedParams.checkIn;  delete normalizedParams.checkIn; }
            if (!normalizedParams.checkout && normalizedParams.checkOut) { normalizedParams.checkout = normalizedParams.checkOut; delete normalizedParams.checkOut; }
            // cityName (edge function) vs destination (URL param)
            if (!normalizedParams.cityName && normalizedParams.destination) { normalizedParams.cityName = normalizedParams.destination; }
            // guest_nationality (edge function) vs nationality (URL param)
            if (!normalizedParams.guest_nationality && normalizedParams.nationality) { normalizedParams.guest_nationality = normalizedParams.nationality; }

            const res = await fetch('/api/search/stream', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(normalizedParams),
            });

            if (!res.ok || !res.body) {
                if (!cancelled) setStatus('error');
                return;
            }

            const reader  = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer           = '';
            let gotFirstHotels   = false;

            while (true) {
                const { done, value } = await reader.read();
                if (done || cancelled) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';

                for (const line of lines) {
                    if (!line.trim() || cancelled) continue;
                    try {
                        const chunk = JSON.parse(line);

                        if (chunk.type === 'hotels' && Array.isArray(chunk.data) && chunk.data.length > 0) {
                            if (!gotFirstHotels) {
                                setProperties(chunk.data.map(normalize));
                                setAllMappable(chunk.allMappable || []);
                                if (chunk.totalCount) setTotalCount(chunk.totalCount);
                                setQueryParams(searchParams);
                                // Brief "completing" phase so the progress bar can animate to 100%
                                // before we switch to the results view.
                                setStatus('completing');
                                setTimeout(() => { if (!cancelled) setStatus('streaming'); }, 400);
                                gotFirstHotels = true;
                            } else {
                                setProperties(prev => [...prev, ...chunk.data.map(normalize)]);
                                setAllMappable(prev => [...prev, ...(chunk.allMappable || [])]);
                            }
                        } else if (chunk.type === 'done') {
                            // Replace the streaming list with the server's final image-filtered result.
                            // This removes any no-image hotels that streamed in before dedup completed.
                            if (Array.isArray(chunk.data) && chunk.data.length > 0) {
                                setProperties(chunk.data.map(normalize));
                                setTotalCount(chunk.data.length);
                            } else if (chunk.totalCount) {
                                setTotalCount(chunk.totalCount);
                            }
                            if (Array.isArray(chunk.allMappable) && chunk.allMappable.length > 0) {
                                setAllMappable(chunk.allMappable);
                            }
                            if (!cancelled) setStatus('done');
                        } else if (chunk.type === 'error') {
                            console.error('[Stream] error chunk:', chunk.message);
                            if (!gotFirstHotels && !cancelled) setStatus('error');
                        }
                    } catch { /* skip malformed line */ }
                }
            }

            if (!gotFirstHotels && !cancelled) setStatus('error');
        };

        run().catch(() => { if (!cancelled) setStatus('error'); });
        return () => { cancelled = true; };
    }, [searchKey]);

    if (status === 'loading' || status === 'completing') {
        return <SearchProgressState destination={destination} isDone={status === 'completing'} />;
    }

    if (status === 'error' && properties.length === 0) {
        return (
            <div className="flex flex-col h-full w-full items-center justify-center gap-2 select-none">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Search unavailable</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">Something went wrong. Try refreshing the page.</p>
            </div>
        );
    }

    return (
        <div className="relative h-full w-full">
            {status === 'streaming' && <StreamingBanner count={properties.length} />}
            <LazySearchMapView
                properties={properties}
                totalCount={totalCount}
                allMappable={allMappable}
                rawSearchParams={queryParams}
                destination={destination}
                isStreaming={status === 'streaming'}
            />
        </div>
    );
}
