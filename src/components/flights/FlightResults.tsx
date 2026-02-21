"use client";

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plane, Search } from 'lucide-react';
import { FlightCard } from './FlightCard';
import { Skeleton } from '@/components/shared/Skeleton/Skeleton';
import type { FlightOffer } from '@/lib/flights/types';

// ─── Skeleton Card ───────────────────────────────────────────────────

function FlightCardSkeleton({ index = 0 }: { index?: number }) {
    return (
        <div
            className="flex flex-col md:flex-row bg-white dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 animate-pulse"
            style={{ animationDelay: `${index * 150}ms` }}
        >
            {/* Left: flight info skeleton */}
            <div className="flex-1 px-2.5 pt-2.5 pb-2 md:p-5">
                {/* Airline header */}
                <div className="flex items-center gap-1.5 md:gap-3 mb-1.5 md:mb-4">
                    <Skeleton width={28} height={28} rounded="md" className="md:!w-10 md:!h-10" />
                    <div>
                        <Skeleton width={90} height={12} className="mb-0.5 md:!w-[120px] md:!h-4" />
                        <Skeleton width={60} height={9} className="md:!w-20 md:!h-3" />
                    </div>
                </div>

                {/* Route timeline */}
                <div className="flex items-center gap-1.5 md:gap-3 mb-1.5 md:mb-4">
                    <div className="text-center">
                        <Skeleton width={42} height={16} className="mb-0.5 md:!w-14 md:!h-6" />
                        <Skeleton width={24} height={9} className="md:!w-8 md:!h-3" />
                    </div>
                    <div className="flex-1 flex flex-col items-center gap-0.5">
                        <Skeleton width={36} height={9} className="md:!w-12 md:!h-3" />
                        <Skeleton width="100%" height={2} />
                        <Skeleton width={40} height={9} className="md:!w-[52px] md:!h-3" />
                    </div>
                    <div className="text-center">
                        <Skeleton width={42} height={16} className="mb-0.5 md:!w-14 md:!h-6" />
                        <Skeleton width={24} height={9} className="md:!w-8 md:!h-3" />
                    </div>
                </div>

                {/* Tags */}
                <div className="flex gap-0.5 md:gap-2">
                    <Skeleton width={50} height={14} rounded="full" className="md:!w-20 md:!h-[22px]" />
                    <Skeleton width={44} height={14} rounded="full" className="md:!w-[72px] md:!h-[22px]" />
                    <Skeleton width={38} height={14} rounded="full" className="md:!w-16 md:!h-[22px]" />
                </div>
            </div>

            {/* Right: price skeleton */}
            <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-1.5 md:gap-2 md:w-[180px] px-2.5 py-2 md:p-5 md:border-l border-t md:border-t-0 border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                <div>
                    <Skeleton width={70} height={20} className="mb-0.5 md:!w-[100px] md:!h-7" />
                    <Skeleton width={50} height={10} className="md:!w-[72px] md:!h-3.5" />
                </div>
                <Skeleton width={76} height={28} rounded="full" className="md:!rounded-lg md:!w-full md:!h-[38px]" />
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
    emptyMessage = 'No flights found. Try adjusting your filters or search for different dates.',
}) => {
    // Loading state — show skeleton cards
    if (loading) {
        return (
            <div className="space-y-2 md:space-y-3">
                {/* Animated header */}
                <div className="flex items-center justify-center gap-2 md:gap-3 py-3 md:py-6">
                    <div className="relative">
                        <div className="w-8 h-8 md:w-12 md:h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                            <Plane className="w-4 h-4 md:w-6 md:h-6 text-indigo-500 animate-pulse" />
                        </div>
                        <div className="absolute inset-0 w-8 h-8 md:w-12 md:h-12 border-2 md:border-[3px] border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                    <div>
                        <p className="text-[10px] md:text-sm font-medium text-slate-700 dark:text-slate-200">Searching flights...</p>
                        <p className="text-[9px] md:text-xs text-slate-400 dark:text-slate-500">Checking multiple providers</p>
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
            <div className="flex flex-col items-center justify-center py-8 md:py-16 gap-2 md:gap-4">
                <div className="w-9 h-9 md:w-14 md:h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <svg className="w-4.5 h-4.5 md:w-7 md:h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                </div>
                <div className="text-center">
                    <h3 className="text-xs md:text-lg font-semibold text-slate-800 dark:text-slate-200">Search Failed</h3>
                    <p className="text-[10px] md:text-sm text-slate-500 dark:text-slate-400 mt-0.5 max-w-sm">{error}</p>
                </div>
                {onRetry && (
                    <button
                        onClick={onRetry}
                        className="mt-1 px-4 md:px-6 py-1.5 md:py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-[10px] md:text-sm transition-colors"
                    >
                        Try Again
                    </button>
                )}
            </div>
        );
    }

    // Empty state
    if (offers.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-8 md:py-16 gap-2 md:gap-4">
                <div className="w-9 h-9 md:w-14 md:h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <Search className="w-4.5 h-4.5 md:w-7 md:h-7 text-slate-400 dark:text-slate-500" />
                </div>
                <div className="text-center">
                    <h3 className="text-xs md:text-lg font-semibold text-slate-700 dark:text-slate-300">No flights found</h3>
                    <p className="text-[10px] md:text-sm text-slate-500 dark:text-slate-400 mt-0.5 max-w-sm">{emptyMessage}</p>
                </div>
            </div>
        );
    }

    // Results
    return (
        <div className="space-y-2 md:space-y-3">
            <AnimatePresence>
                {offers.map((offer, idx) => (
                    <FlightCard
                        key={`${offer.offerId}-${idx}`}
                        offer={offer}
                        index={idx}
                        onSelect={onSelect}
                    />
                ))}
            </AnimatePresence>
        </div>
    );
};

export default FlightResults;
