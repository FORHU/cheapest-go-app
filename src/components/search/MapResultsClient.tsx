'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Property } from '@/types';
import LazySearchMapView from './LazySearchMapView';
import { buildSearchCacheKey, getSearchResults, setSearchResults } from '@/lib/searchResultsCache';

interface MapResultsClientProps {
    searchParams: Record<string, string>;
    destination: string;
    onSwitchView?: (v: 'map' | 'list') => void;
}


function StreamingBanner({ count, pricingMode }: { count: number; pricingMode?: boolean }) {
    const t = useTranslations('hotels.searchResults');

    return (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
            <div className="flex items-center gap-2 bg-white dark:bg-slate-800 shadow-lg rounded-full px-3.5 py-1.5 border border-slate-100 dark:border-slate-700 text-xs whitespace-nowrap">
                <span className="w-3 h-3 rounded-full border-[1.5px] border-blue-500 border-t-transparent animate-spin shrink-0" />
                <span className="text-slate-600 dark:text-slate-300">
                    {pricingMode
                        ? <>{t('checkingAvailability')}</>
                        : <>{t('loadingMore')}{count > 0 ? <> &middot; <strong className="text-slate-800 dark:text-slate-100">{count}</strong> {t('found')}</> : ''}…</>
                    }
                </span>
            </div>
        </div>
    );
}

export function MapResultsClient({ searchParams, destination, onSwitchView }: MapResultsClientProps) {
    const t = useTranslations('hotels.searchResults');

    // 'prices-loading' = catalog hotels shown, TGX prices still in flight
    const cacheKey = buildSearchCacheKey(searchParams);
    const cached = getSearchResults(cacheKey);

    const [status, setStatus]         = useState<'loading' | 'prices-loading' | 'completing' | 'streaming' | 'done' | 'error'>(cached ? 'done' : 'loading');
    const [properties, setProperties] = useState<Property[]>(cached?.properties ?? []);
    const [totalCount, setTotalCount] = useState(cached?.totalCount ?? 0);
    const [allMappable, setAllMappable] = useState<any[]>(cached?.allMappable ?? []);
    const [queryParams, setQueryParams] = useState<Record<string, any>>(cached?.queryParams ?? searchParams);

    const searchKey = JSON.stringify(searchParams);

    useEffect(() => {
        if (status === 'done' && properties.length > 0) {
            setSearchResults(cacheKey, { properties, totalCount, queryParams, allMappable });
        }
    }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (cached) return; // cache hit — skip stream

        let cancelled = false;
        const controller = new AbortController();
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
            // countryCode vs country (landing cards pass "country")
            if (!normalizedParams.countryCode && normalizedParams.country) { normalizedParams.countryCode = normalizedParams.country; }
            // guest_nationality (edge function) vs nationality (URL param)
            if (!normalizedParams.guest_nationality && normalizedParams.nationality) { normalizedParams.guest_nationality = normalizedParams.nationality; }

            const res = await fetch('/api/search/stream', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(normalizedParams),
                signal:  controller.signal,
            });

            if (!res.ok || !res.body) {
                if (!cancelled) setStatus('error');
                return;
            }

            const reader  = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer        = '';
            let gotFirstHotels = false;
            let gotDone        = false;

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

                        if (chunk.type === 'hotels') {
                            if (Array.isArray(chunk.data) && chunk.data.length > 0) {
                                if (!gotFirstHotels) {
                                    setProperties(chunk.data.map(normalize));
                                    setAllMappable(chunk.allMappable || []);
                                    if (chunk.totalCount) setTotalCount(chunk.totalCount);
                                    setQueryParams(searchParams);
                                    if (chunk.source === 'catalog') {
                                        // Phase 1: catalog arrived instantly — show map immediately,
                                        // stay in 'prices-loading' so the banner shows while TGX runs.
                                        setStatus('streaming');
                                    } else {
                                        // Priced results (TGX direct or cache hit) — normal flow.
                                        setStatus('completing');
                                        setTimeout(() => { if (!cancelled) setStatus('streaming'); }, 400);
                                    }
                                    gotFirstHotels = true;
                                } else {
                                    setProperties(prev => [...prev, ...chunk.data.map(normalize)]);
                                    setAllMappable(prev => [...prev, ...(chunk.allMappable || [])]);
                                }
                            }
                            // Mark that we received a valid response even if empty
                            gotDone = true;
                        } else if (chunk.type === 'prices') {
                            // Phase 2: TGX prices arrived — overlay onto catalog cards.
                            // Hotels not matched by TGX have no availability; remove them immediately.
                            if (Array.isArray(chunk.data) && chunk.data.length > 0) {
                                const priceMap = new Map(
                                    (chunk.data as any[]).map((p: any) => [p.hotelId, p])
                                );
                                setProperties(prev => prev
                                    .map(h => {
                                        const p = priceMap.get((h as any).id ?? (h as any).hotelId);
                                        if (!p) return h;
                                        return { ...h, price: p.price, currency: p.currency, offerId: p.offerId, refundableTag: p.refundableTag, boardCode: p.boardCode, _tgx: p._tgx, priceLoading: false } as any;
                                    })
                                    .filter((h: any) => !h.priceLoading)
                                );
                                setAllMappable(prev => prev
                                    .map(h => {
                                        const p = priceMap.get((h as any).id ?? (h as any).hotelId);
                                        if (!p) return h;
                                        // priceLoading: false so the hotel survives the filter below
                                        return { ...h, price: p.price, currency: p.currency, priceLoading: false };
                                    })
                                    .filter((h: any) => !h.priceLoading)
                                );
                            }
                        } else if (chunk.type === 'done') {
                            if (Array.isArray(chunk.data) && chunk.data.length > 0) {
                                setProperties(chunk.data.map(normalize));
                                setTotalCount(chunk.data.length);
                            } else if (chunk.totalCount) {
                                setTotalCount(chunk.totalCount);
                            }
                            if (Array.isArray(chunk.allMappable) && chunk.allMappable.length > 0) {
                                // Only use done.allMappable (TGX IDs) as a fallback when the prices
                                // event didn't populate allMappable with catalog-ID hotels.
                                // Overwriting here would cause card IDs (catalog) to mismatch pin IDs (TGX).
                                setAllMappable(prev => prev.length > 0 ? prev : chunk.allMappable);
                            }
                            // Remove catalog hotels that TGX had no pricing for (unavailable dates).
                            setProperties(prev => {
                                const filtered = prev.filter((h: any) => !h.priceLoading);
                                if (filtered.length > 0 && chunk.totalCount) setTotalCount(filtered.length);
                                return filtered;
                            });
                            setAllMappable(prev => prev.filter((h: any) => !h.priceLoading));
                            gotDone = true;
                            if (!cancelled) setStatus('done');
                        } else if (chunk.type === 'error') {
                            console.error('[Stream] error chunk:', chunk.message);
                            if (!gotFirstHotels && !cancelled) {
                                setStatus('error');
                            } else if (gotFirstHotels && !cancelled) {
                                // TGX failed after catalog was shown — remove stuck priceLoading cards
                                setProperties(prev => prev.filter((h: any) => !h.priceLoading));
                                setAllMappable(prev => prev.filter((h: any) => !h.priceLoading));
                                setStatus('done');
                            }
                        }
                    } catch { /* skip malformed line */ }
                }
            }

            // Only show error if we never received ANY valid response from the server
            if (!gotDone && !gotFirstHotels && !cancelled) setStatus('error');
        };

        run().catch((err) => { if (!cancelled && err?.name !== 'AbortError') setStatus('error'); });
        return () => { cancelled = true; controller.abort(); };
    }, [searchKey]);

    // Show a skeleton while the first hotels haven't arrived yet
    if (status === 'loading' || status === 'completing') {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <div className="flex flex-col items-center gap-3 select-none">
                    <span className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                    <p className="text-xs text-slate-400 dark:text-slate-500">{t('searching')}</p>
                </div>
            </div>
        );
    }

    if (status === 'done' && properties.length === 0) {
        return (
            <div className="flex flex-col h-full w-full items-center justify-center gap-2 select-none">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t('noHotelsFound')}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">{t('tryDifferentDates')}</p>
            </div>
        );
    }

    if (status === 'error' && properties.length === 0) {
        return (
            <div className="flex flex-col h-full w-full items-center justify-center gap-2 select-none">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t('searchUnavailable')}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">{t('refreshPage')}</p>
            </div>
        );
    }

    // Catalog hotels shown, TGX prices still loading — show map with pricing banner
    const isPricingLoading = status === 'streaming' && properties.some((h: any) => h.priceLoading);

    return (
        <div className="relative h-full w-full">
            {isPricingLoading && <StreamingBanner count={totalCount} pricingMode />}
            {!isPricingLoading && status === 'streaming' && <StreamingBanner count={totalCount} />}
            <LazySearchMapView
                properties={properties}
                totalCount={totalCount}
                allMappable={allMappable}
                rawSearchParams={queryParams}
                destination={destination}
                isStreaming={status === 'streaming'}
                onSwitchToList={onSwitchView ? () => onSwitchView('list') : undefined}
            />
        </div>
    );
}
