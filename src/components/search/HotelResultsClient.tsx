'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Property } from '@/types';
import SearchResults from './SearchResults';
import { CountryCityPicker } from './CountryCityPicker';
import { ResponsiveSearchHeader } from './ResponsiveSearchHeader';
import { buildSearchCacheKey, getSearchResults, setSearchResults } from '@/lib/searchResultsCache';

interface HotelResultsClientProps {
    searchParams: Record<string, string>;
    onSwitchView?: (v: 'map' | 'list') => void;
}

function HotelListSkeleton({ destination, elapsed }: { destination: string; elapsed: number }) {
    const t = useTranslations('hotels.searchResults');

    return (
        <div className="flex-1 min-w-0 animate-pulse">
            <div className="flex items-center justify-between mb-4 md:mb-6">
                <div className="space-y-2">
                    <div className="h-6 w-48 bg-slate-200 dark:bg-slate-700 rounded-lg" />
                    <p className="text-sm text-slate-500 dark:text-slate-400 animate-none!">
                        {destination ? t('searchingInDestination', { destination }) : t('searching')}
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

export function HotelResultsClient({ searchParams, onSwitchView }: HotelResultsClientProps) {
    const t = useTranslations('hotels.searchResults');

    const cacheKey = buildSearchCacheKey(searchParams);
    const cached = getSearchResults(cacheKey);

    const [status, setStatus] = useState<'loading' | 'streaming' | 'done' | 'error'>(cached ? 'done' : 'loading');
    const [properties, setProperties] = useState<Property[]>(cached?.properties ?? []);
    const [totalCount, setTotalCount] = useState(cached?.totalCount ?? 0);
    const [elapsed, setElapsed] = useState(0);

    const destination = searchParams.destination || '';
    const searchKey = JSON.stringify(searchParams);

    useEffect(() => {
        if (cached) return;

        let cancelled = false;
        const controller = new AbortController();
        setStatus('loading');
        setElapsed(0);
        setProperties([]);

        const timer = setInterval(() => setElapsed(e => e + 1), 1000);

        // Accumulated list shared between closures so price patches mutate in-place
        const accumulated: Property[] = [];

        // Normalize URL param names to match the stream endpoint's expected keys
        const streamParams: Record<string, string> = { ...searchParams };
        if (!streamParams.checkin  && streamParams.checkIn)  { streamParams.checkin  = streamParams.checkIn;  delete streamParams.checkIn; }
        if (!streamParams.checkout && streamParams.checkOut) { streamParams.checkout = streamParams.checkOut; delete streamParams.checkOut; }
        if (!streamParams.cityName && streamParams.destination) { streamParams.cityName = streamParams.destination; }
        if (!streamParams.guest_nationality && streamParams.nationality) { streamParams.guest_nationality = streamParams.nationality; }

        fetch('/api/search/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(streamParams),
            signal: controller.signal,
        })
            .then(async res => {
                if (cancelled || !res.body) {
                    if (!cancelled) setStatus('error');
                    return;
                }

                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buf = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done || cancelled) break;

                    buf += decoder.decode(value, { stream: true });
                    const lines = buf.split('\n');
                    buf = lines.pop() ?? '';

                    for (const line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const msg = JSON.parse(line);

                            if (msg.type === 'hotels') {
                                // Phase 1 (catalog, ~10ms) or new TGX hotels not in catalog.
                                // Show immediately so the user sees real cards while prices load.
                                accumulated.push(...(msg.data ?? []));
                                if (!cancelled) {
                                    setProperties([...accumulated]);
                                    setTotalCount(msg.totalCount ?? accumulated.length);
                                    setStatus('streaming');
                                }
                            } else if (msg.type === 'prices') {
                                // Phase 2 price patch: update price fields in-place, clear priceLoading.
                                const priceMap = new Map<string, any>(
                                    (msg.data ?? []).map((p: any) => [p.hotelId, p])
                                );
                                let patched = false;
                                for (let i = 0; i < accumulated.length; i++) {
                                    const h = accumulated[i] as any;
                                    const upd = priceMap.get(h.hotelId ?? h.id) ?? priceMap.get(h.id);
                                    if (upd) {
                                        accumulated[i] = {
                                            ...h,
                                            price:        upd.price        ?? h.price,
                                            currency:     upd.currency     ?? h.currency,
                                            offerId:      upd.offerId      ?? h.offerId,
                                            refundableTag: upd.refundableTag ?? h.refundableTag,
                                            boardCode:    upd.boardCode    ?? h.boardCode,
                                            _tgx:         upd._tgx        ?? h._tgx,
                                            priceLoading: false,
                                        };
                                        patched = true;
                                    }
                                }
                                if (patched && !cancelled) setProperties([...accumulated]);
                            } else if (msg.type === 'remove') {
                                const removeIds = new Set<string>(msg.ids ?? []);
                                const before = accumulated.length;
                                accumulated.splice(0, accumulated.length, ...accumulated.filter((h: any) =>
                                    !removeIds.has(h.hotelId ?? h.id) && !removeIds.has(h.id)
                                ));
                                if (accumulated.length !== before && !cancelled) setProperties([...accumulated]);
                            } else if (msg.type === 'done') {
                                // Drop catalog hotels that never received a TGX price — they have
                                // no real availability for these dates and would show "0 rooms" if clicked.
                                const priced = accumulated.filter((h: any) => h.priceLoading !== true && h.price > 0);
                                if (priced.length !== accumulated.length) {
                                    accumulated.splice(0, accumulated.length, ...priced);
                                    if (!cancelled) setProperties([...accumulated]);
                                }
                                if (!cancelled) {
                                    setTotalCount(accumulated.length);
                                    setStatus('done');
                                }
                                // Cache the fully-priced results for 10 minutes
                                setSearchResults(cacheKey, {
                                    properties: [...accumulated],
                                    totalCount: accumulated.length,
                                    allMappable: msg.allMappable ?? [],
                                    queryParams: searchParams,
                                });
                            } else if (msg.type === 'error') {
                                console.error('[HotelResultsClient] stream error:', msg.message);
                                if (!cancelled) {
                                    setStatus(accumulated.length > 0 ? 'done' : 'error');
                                }
                            }
                        } catch {
                            // Malformed line — skip
                        }
                    }
                }

                // Fallback: ensure we exit loading even if done/error events were missed
                if (!cancelled && (status as string) === 'loading') setStatus('done');
            })
            .catch((err) => { if (!cancelled && err?.name !== 'AbortError') setStatus('error'); })
            .finally(() => clearInterval(timer));

        return () => {
            cancelled = true;
            controller.abort();
            clearInterval(timer);
        };
    }, [searchKey]); // eslint-disable-line react-hooks/exhaustive-deps

    if (status === 'loading') {
        return (
            <div className="flex-1 min-w-0">
                <Suspense fallback={<div className="h-16" />}>
                    <ResponsiveSearchHeader />
                </Suspense>
                <HotelListSkeleton destination={destination} elapsed={elapsed} />
            </div>
        );
    }

    if (status === 'error') {
        return (
            <div className="flex-1 min-w-0">
                <Suspense fallback={<div className="h-16" />}>
                    <ResponsiveSearchHeader />
                </Suspense>
                <div className="text-center py-20 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                    <p className="text-slate-500 dark:text-slate-400 text-sm">{t('searchFailed')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 min-w-0">
            <Suspense fallback={<div className="h-16" />}>
                <ResponsiveSearchHeader />
            </Suspense>
            <CountryCityPicker searchParams={searchParams} />
            {/* key={status} forces SearchResults to re-sync allProperties when price arrivals arrive
                (streaming → done). The single remount is imperceptible after ~18s of price skeletons. */}
            <SearchResults
                key={status}
                initialProperties={properties}
                totalCount={totalCount}
                rawSearchParams={searchParams}
                onSwitchToMap={onSwitchView ? () => onSwitchView('map') : undefined}
            />
        </div>
    );
}
