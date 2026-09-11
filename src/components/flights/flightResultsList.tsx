"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plane, Search, ChevronDown } from 'lucide-react';
import { FlightCard } from './flightCard';
import { Skeleton } from '@/components/shared/Skeleton/Skeleton';
import type { FlightOffer } from '@/types/flights';
import { useTranslations } from 'next-intl';

const PAGE_SIZE = 15;

// ─── Skeleton Card ───────────────────────────────────────────────────

function FlightCardSkeleton({ index = 0 }: { index?: number }) {
    return (
        <div
            className="relative w-full bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200/70 dark:border-slate-700 shadow-[0_10px_30px_-14px_rgba(15,23,42,0.14)] animate-pulse"
            style={{ animationDelay: `${index * 150}ms` }}
        >
            {/* Save/heart button placeholder (mobile only — top-right corner), mirrors
                FlightCard's absolutely-positioned SaveButton in the same spot. */}
            <div className="absolute top-2 right-2 z-10 lg:hidden">
                <Skeleton width={28} height={28} rounded="full" />
            </div>

            <div className="flex flex-col lg:flex-row">
                {/* ─── Flight info (left) ─── */}
                <div className="flex-1 min-w-0">
                    <div className="p-4 lg:p-6">
                        {/* Airline logo/name/flight-number + tag pills */}
                        <div className="flex flex-wrap items-start gap-x-3 gap-y-2 mb-3 lg:mb-4">
                            <div className="flex items-center gap-2 shrink-0">
                                <Skeleton width={32} height={32} rounded="full" className="shrink-0 lg:!w-10 lg:!h-10" />
                                <div className="min-w-0">
                                    <Skeleton width={90} height={12} className="mb-1 lg:!w-[120px] lg:!h-[14px]" />
                                    <Skeleton width={55} height={10} className="lg:!w-[72px] lg:!h-[12px]" />
                                </div>
                            </div>

                            {/* Tag pills — carry-on bag, checked bag, refundability, cabin class */}
                            <div className="flex flex-wrap items-center gap-1 lg:gap-1.5 min-w-0">
                                <Skeleton width={72} height={17} rounded="full" className="lg:!w-[96px] lg:!h-[22px]" />
                                <Skeleton width={64} height={17} rounded="full" className="lg:!w-[84px] lg:!h-[22px]" />
                                <Skeleton width={92} height={17} rounded="full" className="lg:!w-[124px] lg:!h-[22px]" />
                                <Skeleton width={56} height={17} rounded="full" className="lg:!w-[72px] lg:!h-[22px]" />
                            </div>
                        </div>

                        {/* Route timeline — departure / duration-stops / arrival */}
                        <div className="flex items-start justify-between gap-1 lg:gap-3">
                            {/* Departure column */}
                            <div className="flex w-[34%] shrink-0 flex-col gap-0.5 sm:w-[26%]">
                                <Skeleton width={56} height={20} className="lg:!w-[72px] lg:!h-[28px]" />
                                <Skeleton width={46} height={9} className="lg:!w-[58px] lg:!h-[11px]" />
                                <Skeleton width="100%" height={11} className="lg:!h-[13px]" />
                                <Skeleton width="75%" height={10} className="lg:!h-[12px]" />
                            </div>

                            {/* Middle: total duration + dotted divider + stops */}
                            <div className="flex min-w-0 flex-1 flex-col items-center gap-1 px-1 pt-1.5 lg:px-2">
                                <Skeleton width={92} height={10} className="lg:!w-[124px] lg:!h-[12px]" />
                                {/* Static dotted rule, not a pulsing placeholder shape, so it
                                    stays a plain border echoing the real card's dotted divider
                                    rather than going through Skeleton. */}
                                <div className="w-full border-t border-dotted border-slate-200 dark:border-white/10" />
                                <Skeleton width={70} height={10} className="lg:!w-[96px] lg:!h-[12px]" />
                            </div>

                            {/* Arrival column */}
                            <div className="flex w-[34%] shrink-0 flex-col items-end gap-0.5 text-right sm:w-[26%]">
                                <Skeleton width={56} height={20} className="lg:!w-[72px] lg:!h-[28px]" />
                                <Skeleton width={46} height={9} className="lg:!w-[58px] lg:!h-[11px]" />
                                <Skeleton width="100%" height={11} className="lg:!h-[13px]" />
                                <Skeleton width="60%" height={10} className="lg:!h-[12px]" />
                            </div>
                        </div>
                    </div>

                    {/* "Show all segments" toggle placeholder — sibling of the content
                        wrapper above, same as the real button's own bottom padding. */}
                    <div className="flex items-center gap-1 px-4 lg:px-6 pb-4 lg:pb-6">
                        <Skeleton width={14} height={14} rounded="sm" />
                        <Skeleton width={92} height={10} className="lg:!w-[112px] lg:!h-[12px]" />
                    </div>
                </div>

                {/* ─── Price rail (right when collapsed) ─── */}
                <div className="relative flex flex-row items-center justify-between gap-1 lg:gap-1.5 p-4 lg:p-6 border-t border-slate-100 dark:border-slate-800 lg:flex-col lg:w-[180px] lg:border-l lg:border-t-0">
                    {/* Save/heart button placeholder — desktop only, inline at the top */}
                    <div className="hidden lg:flex justify-end w-full mb-1">
                        <Skeleton width={28} height={28} rounded="full" />
                    </div>

                    <div>
                        <Skeleton width={70} height={20} className="mb-0.5 lg:!w-[100px] lg:!h-7" />
                        <Skeleton width={50} height={10} className="lg:!w-[72px] lg:!h-3.5" />
                    </div>

                    <div className="flex items-center gap-2 lg:mt-auto">
                        <Skeleton width={76} height={30} rounded="full" className="lg:!rounded-md lg:!w-[112px] lg:!h-[38px]" />
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Props ───────────────────────────────────────────────────────────

export interface FlightResultsProps {
    offers: FlightOffer[];
    loading: boolean;
    error?: string | null;
    onSelect?: (offer: FlightOffer) => void;
    onRetry?: () => void;
    skeletonCount?: number;
    emptyMessage?: string;
}

// ─── FlightResults ───────────────────────────────────────────────────

export const FlightResults: React.FC<FlightResultsProps> = ({
    offers,
    loading,
    error = null,
    onSelect,
    onRetry,
    skeletonCount = 5,
    emptyMessage,
}) => {
    const t = useTranslations('flights.results');
    // Loading state — show skeleton cards
    if (loading) {
        return (
            <div className="space-y-3">
                {/* Animated header */}
                <div className="flex items-center justify-center gap-2 lg:gap-3 py-2 lg:py-4">
                    <div className="relative">
                        <div className="w-8 h-8 lg:w-12 lg:h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                            <Plane className="w-4 h-4 lg:w-6 lg:h-6 text-indigo-500 animate-pulse" />
                        </div>
                        <div className="absolute inset-0 w-8 h-8 lg:w-12 lg:h-12 border-2 lg:border-[3px] border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                    <div>
                        <p className="text-[10px] lg:text-sm font-medium text-slate-700 dark:text-slate-200">{t('searchingFlights')}</p>
                        <p className="text-[9px] lg:text-xs text-slate-400 dark:text-slate-500">{t('checkingProviders')}</p>
                    </div>
                </div>

                {/* Skeleton cards */}
                {Array.from({ length: skeletonCount }).map((_, i) => (
                    <FlightCardSkeleton key={i} index={i} />
                ))}
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="flex flex-col items-center justify-center py-8 lg:py-16 gap-2 lg:gap-4">
                <div className="w-9 h-9 lg:w-14 lg:h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <svg className="w-4.5 h-4.5 lg:w-7 lg:h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                </div>
                <div className="text-center">
                    <h3 className="text-xs lg:text-lg font-semibold text-slate-800 dark:text-slate-200">{t('searchFailedTitle')}</h3>
                    <p className="text-[10px] lg:text-sm text-slate-500 dark:text-slate-400 mt-0.5 max-w-sm">{error}</p>
                </div>
                {onRetry && (
                    <button
                        onClick={onRetry}
                        className="mt-1 px-4 lg:px-6 py-1.5 lg:py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-[10px] lg:text-sm transition-colors"
                    >
                        {t('tryAgain')}
                    </button>
                )}
            </div>
        );
    }

    // Empty state
    if (offers.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-8 lg:py-16 gap-2 lg:gap-4">
                <div className="w-9 h-9 lg:w-14 lg:h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <Search className="w-4.5 h-4.5 lg:w-7 lg:h-7 text-slate-400 dark:text-slate-500" />
                </div>
                <div className="text-center">
                    <h3 className="text-xs lg:text-lg font-semibold text-slate-700 dark:text-slate-300">{t('noFlightsTitle')}</h3>
                    <p className="text-[10px] lg:text-sm text-slate-500 dark:text-slate-400 mt-0.5 max-w-sm">{emptyMessage ?? t('noFlightsDefaultMessage')}</p>
                </div>
            </div>
        );
    }

    // Results
    return <PaginatedResults offers={offers} onSelect={onSelect} resetKey={offers} />;
};

// ─── Paginated Results ───────────────────────────────────────────────

function PaginatedResults({ offers, onSelect, resetKey }: { offers: FlightOffer[]; onSelect?: (offer: FlightOffer) => void; resetKey?: unknown }) {
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const [isAutoLoading, setIsAutoLoading] = useState(false);
    const sentinelRef = React.useRef<HTMLDivElement>(null);
    const t = useTranslations('flights.results');

    // Reset to first page whenever the offer list or filters change
    React.useEffect(() => { setVisibleCount(PAGE_SIZE); }, [resetKey]);

    // Infinite Scroll Implementation
    React.useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && offers.length > visibleCount) {
                    setIsAutoLoading(true);
                    // Artificial delay for smoother transition/skeleton visibility
                    setTimeout(() => {
                        setVisibleCount(prev => Math.min(prev + PAGE_SIZE, offers.length));
                        setIsAutoLoading(false);
                    }, 1200);
                }
            },
            { threshold: 0.1, rootMargin: '100px' }
        );

        if (sentinelRef.current) {
            observer.observe(sentinelRef.current);
        }

        return () => observer.disconnect();
    }, [offers.length, visibleCount]);

    const visible = offers.slice(0, visibleCount);
    const hasMore = offers.length > visibleCount;

    return (
        <div className="space-y-3">
            <AnimatePresence mode="popLayout">
                {visible.map((offer, idx) => (
                    <FlightCard
                        key={`${offer.offerId}-${idx}`}
                        offer={offer}
                        index={idx}
                        onSelect={onSelect}
                    />
                ))}
            </AnimatePresence>

            {/* Sentinel element for infinite scroll */}
            <div ref={sentinelRef} className="h-1 w-full pointer-events-none" />

            {/* Loading Skeleton for Infinite Scroll */}
            {(hasMore || isAutoLoading) && (
                <div className="space-y-3 pb-8">
                    <FlightCardSkeleton index={0} />
                    <FlightCardSkeleton index={1} />
                    <FlightCardSkeleton index={2} />
                    <div className="flex flex-col items-center gap-2 py-4">
                        <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 animate-pulse">
                            <div className="w-1 h-1 rounded-full bg-indigo-500" />
                            <p className="text-[10px] font-bold uppercase tracking-widest">
                                {t('discoveringMore', { shown: visible.length, total: offers.length })}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* End of Results Message */}
            {!hasMore && !isAutoLoading && offers.length > 0 && (
                <div className="pt-4 pb-12 text-center">
                    <p className="text-[10px] font-normal text-slate-400 dark:text-slate-500 uppercase tracking-widest opacity-60">
                        {t('allSeen', { count: offers.length })}
                    </p>
                </div>
            )}
        </div>
    );
}

export default FlightResults;
