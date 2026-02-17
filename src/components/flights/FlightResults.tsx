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
            <div className="flex-1 p-5">
                {/* Airline header */}
                <div className="flex items-center gap-3 mb-4">
                    <Skeleton width={40} height={40} rounded="lg" />
                    <div>
                        <Skeleton width={120} height={16} className="mb-1.5" />
                        <Skeleton width={80} height={12} />
                    </div>
                </div>

                {/* Route timeline */}
                <div className="flex items-center gap-3 mb-4">
                    <div className="text-center">
                        <Skeleton width={56} height={24} className="mb-1" />
                        <Skeleton width={32} height={12} />
                    </div>
                    <div className="flex-1 flex flex-col items-center gap-1">
                        <Skeleton width={48} height={12} />
                        <Skeleton width="100%" height={2} />
                        <Skeleton width={52} height={12} />
                    </div>
                    <div className="text-center">
                        <Skeleton width={56} height={24} className="mb-1" />
                        <Skeleton width={32} height={12} />
                    </div>
                </div>

                {/* Tags */}
                <div className="flex gap-2">
                    <Skeleton width={80} height={22} rounded="full" />
                    <Skeleton width={72} height={22} rounded="full" />
                    <Skeleton width={64} height={22} rounded="full" />
                </div>
            </div>

            {/* Right: price skeleton */}
            <div className="flex flex-col items-end justify-center gap-2 md:w-[180px] p-5 md:border-l border-t md:border-t-0 border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                <Skeleton width={100} height={28} className="mb-1" />
                <Skeleton width={72} height={14} />
                <Skeleton width={56} height={12} className="mb-2" />
                <Skeleton width="100%" height={38} rounded="lg" />
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
            <div className="space-y-3">
                {/* Animated header */}
                <div className="flex items-center justify-center gap-3 py-6">
                    <div className="relative">
                        <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                            <Plane className="w-6 h-6 text-indigo-500 animate-pulse" />
                        </div>
                        <div className="absolute inset-0 w-12 h-12 border-[3px] border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Searching flights...</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">Checking multiple providers</p>
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
            <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                </div>
                <div className="text-center">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Search Failed</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm">{error}</p>
                </div>
                {onRetry && (
                    <button
                        onClick={onRetry}
                        className="mt-2 px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors"
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
            <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <Search className="w-7 h-7 text-slate-400 dark:text-slate-500" />
                </div>
                <div className="text-center">
                    <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">No flights found</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm">{emptyMessage}</p>
                </div>
            </div>
        );
    }

    // Results
    return (
        <div className="space-y-3">
            <AnimatePresence>
                {offers.map((offer, idx) => (
                    <FlightCard
                        key={offer.offerId}
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
