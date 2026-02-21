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
            className="flex flex-col lg:flex-row bg-white dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 animate-pulse"
            style={{ animationDelay: `${index * 150}ms` }}
        >
            {/* Left: flight info skeleton */}
            <div className="flex-1 px-2.5 pt-2.5 pb-2 lg:p-5">
                {/* Airline header */}
                <div className="flex items-center gap-1.5 lg:gap-3 mb-1.5 lg:mb-4">
                    <Skeleton width={28} height={28} rounded="md" className="lg:!w-10 lg:!h-10" />
                    <div>
                        <Skeleton width={90} height={12} className="mb-0.5 lg:!w-[120px] lg:!h-4" />
                        <Skeleton width={60} height={9} className="lg:!w-20 lg:!h-3" />
                    </div>
                </div>

                {/* Route timeline */}
                <div className="flex items-center gap-1.5 lg:gap-3 mb-1.5 lg:mb-4">
                    <div className="text-center">
                        <Skeleton width={42} height={16} className="mb-0.5 lg:!w-14 lg:!h-6" />
                        <Skeleton width={24} height={9} className="lg:!w-8 lg:!h-3" />
                    </div>
                    <div className="flex-1 flex flex-col items-center gap-0.5">
                        <Skeleton width={36} height={9} className="lg:!w-12 lg:!h-3" />
                        <Skeleton width="100%" height={2} />
                        <Skeleton width={40} height={9} className="lg:!w-[52px] lg:!h-3" />
                    </div>
                    <div className="text-center">
                        <Skeleton width={42} height={16} className="mb-0.5 lg:!w-14 lg:!h-6" />
                        <Skeleton width={24} height={9} className="lg:!w-8 lg:!h-3" />
                    </div>
                </div>

                {/* Tags */}
                <div className="flex gap-0.5 lg:gap-2">
                    <Skeleton width={50} height={14} rounded="full" className="lg:!w-20 lg:!h-[22px]" />
                    <Skeleton width={44} height={14} rounded="full" className="lg:!w-[72px] lg:!h-[22px]" />
                    <Skeleton width={38} height={14} rounded="full" className="lg:!w-16 lg:!h-[22px]" />
                </div>
            </div>

            {/* Right: price skeleton */}
            <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between lg:justify-center gap-1.5 lg:gap-2 lg:w-[180px] px-2.5 py-2 lg:p-5 lg:border-l border-t lg:border-t-0 border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                <div>
                    <Skeleton width={70} height={20} className="mb-0.5 lg:!w-[100px] lg:!h-7" />
                    <Skeleton width={50} height={10} className="lg:!w-[72px] lg:!h-3.5" />
                </div>
                <Skeleton width={76} height={28} rounded="full" className="lg:!rounded-lg lg:!w-full lg:!h-[38px]" />
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
            <div className="space-y-2 lg:space-y-3">
                {/* Animated header */}
                <div className="flex items-center justify-center gap-2 lg:gap-3 py-3 lg:py-6">
                    <div className="relative">
                        <div className="w-8 h-8 lg:w-12 lg:h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                            <Plane className="w-4 h-4 lg:w-6 lg:h-6 text-indigo-500 animate-pulse" />
                        </div>
                        <div className="absolute inset-0 w-8 h-8 lg:w-12 lg:h-12 border-2 lg:border-[3px] border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                    <div>
                        <p className="text-[10px] lg:text-sm font-medium text-slate-700 dark:text-slate-200">Searching flights...</p>
                        <p className="text-[9px] lg:text-xs text-slate-400 dark:text-slate-500">Checking multiple providers</p>
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
                    <h3 className="text-xs lg:text-lg font-semibold text-slate-800 dark:text-slate-200">Search Failed</h3>
                    <p className="text-[10px] lg:text-sm text-slate-500 dark:text-slate-400 mt-0.5 max-w-sm">{error}</p>
                </div>
                {onRetry && (
                    <button
                        onClick={onRetry}
                        className="mt-1 px-4 lg:px-6 py-1.5 lg:py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-[10px] lg:text-sm transition-colors"
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
            <div className="flex flex-col items-center justify-center py-8 lg:py-16 gap-2 lg:gap-4">
                <div className="w-9 h-9 lg:w-14 lg:h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <Search className="w-4.5 h-4.5 lg:w-7 lg:h-7 text-slate-400 dark:text-slate-500" />
                </div>
                <div className="text-center">
                    <h3 className="text-xs lg:text-lg font-semibold text-slate-700 dark:text-slate-300">No flights found</h3>
                    <p className="text-[10px] lg:text-sm text-slate-500 dark:text-slate-400 mt-0.5 max-w-sm">{emptyMessage}</p>
                </div>
            </div>
        );
    }

    // Results
    return (
        <div className="space-y-2 lg:space-y-3">
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
