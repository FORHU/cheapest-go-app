"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plane, Search, ChevronDown, AlertCircle } from 'lucide-react';
import { FlightCard } from './flightCard';
import { Skeleton } from '@/components/shared/Skeleton/Skeleton';
import type { FlightOffer } from '@/types/flights';

const PAGE_SIZE = 15;

// ─── Skeleton Card ───────────────────────────────────────────────────

function FlightCardSkeleton({ index = 0 }: { index?: number }) {
    return (
        <div
            className="flex flex-col bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 animate-pulse"
            style={{ animationDelay: `${index * 150}ms` }}
        >
            {/* Header: Airline + Price */}
            <div className="p-3 sm:p-5 lg:p-6 pb-0 sm:pb-0 lg:pb-0 flex items-start justify-between">
                <div className="flex items-center gap-2 sm:gap-4">
                    <Skeleton width={32} height={32} rounded="lg" className="sm:w-10 sm:h-10" />
                    <div className="space-y-1.5 sm:space-y-2">
                        <Skeleton width={100} height={14} className="sm:w-[120px] sm:h-4" />
                        <Skeleton width={50} height={8} className="sm:w-15 sm:h-2.5" />
                    </div>
                </div>
                <div className="flex flex-col items-end space-y-1.5 sm:space-y-2">
                    <Skeleton width={70} height={20} className="sm:w-20 sm:h-7" />
                    <Skeleton width={50} height={8} className="sm:w-15 sm:h-2.5" />
                </div>
            </div>

            {/* Body: Timeline */}
            <div className="p-3 sm:p-5 lg:p-8 flex flex-col sm:flex-row items-center gap-3 sm:gap-12">
                <div className="flex-1 flex items-center justify-between w-full gap-2 sm:gap-4 lg:gap-16">
                    <div className="space-y-1.5 sm:space-y-2">
                        <Skeleton width={70} height={24} className="sm:w-20 sm:h-9" />
                        <Skeleton width={35} height={10} className="sm:w-10 sm:h-3" />
                    </div>
                    <div className="flex-1 space-y-2 sm:space-y-3 flex flex-col items-center">
                        <Skeleton width={50} height={12} rounded="full" className="sm:w-15 sm:h-3.5" />
                        <Skeleton width="100%" height={3} rounded="full" className="sm:h-1" />
                        <Skeleton width={40} height={8} className="sm:w-12.5 sm:h-2.5" />
                    </div>
                    <div className="space-y-1.5 sm:space-y-2 flex flex-col items-end">
                        <Skeleton width={70} height={24} className="sm:w-20 sm:h-9" />
                        <Skeleton width={35} height={10} className="sm:w-10 sm:h-3" />
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="px-3 sm:px-5 pb-3 sm:pb-5 lg:px-8 lg:pb-8">
                <div className="pt-2 sm:pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-3 sm:gap-5">
                    <div className="flex gap-1.5 sm:gap-2">
                        <Skeleton width={60} height={18} rounded="lg" className="sm:w-[70px] sm:h-6 sm:rounded-xl" />
                        <Skeleton width={70} height={18} rounded="lg" className="sm:w-[80px] sm:h-6 sm:rounded-xl" />
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3">
                        <Skeleton width={36} height={36} rounded="xl" className="sm:w-10 sm:h-10 sm:rounded-full" />
                        <Skeleton width="100%" height={40} rounded="lg" className="sm:h-12 sm:rounded-xl" />
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
    emptyMessage = 'No flights found. Try adjusting your filters or search for different dates.',
}) => {
    // Loading state — show skeleton cards
    if (loading) {
        return (
            <div className="space-y-2 sm:space-y-3 lg:space-y-4">
                {/* Animated header */}
                <div className="flex items-center justify-center gap-4 py-6 lg:py-10">
                    <div className="relative">
                        <div className="w-12 h-12 lg:w-16 lg:h-16 rounded-3xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                            <Plane className="w-6 h-6 lg:w-8 lg:h-8 text-blue-500 animate-pulse" />
                        </div>
                        <div className="absolute inset-0 w-12 h-12 lg:w-16 lg:h-16 border-2 lg:border-[4px] border-blue-500 border-t-transparent rounded-3xl animate-spin" />
                    </div>
                    <div>
                        <h3 className="text-sm lg:text-lg font-black text-slate-900 dark:text-white uppercase tracking-wider">Finding the best deals</h3>
                        <p className="text-xs lg:text-sm text-slate-500 font-bold">Scanning multiple airline providers...</p>
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
            <div className="flex flex-col items-center justify-center py-12 lg:py-20 gap-6">
                <div className="w-16 h-16 rounded-3xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center border border-red-100 dark:border-red-500/20 shadow-xl shadow-red-500/10">
                    <AlertCircle size={32} className="text-red-500" />
                </div>
                <div className="text-center space-y-2">
                    <h3 className="text-lg lg:text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Search Failed</h3>
                    <p className="text-sm lg:text-base text-slate-500 font-medium max-w-sm mx-auto">{error}</p>
                </div>
                {onRetry && (
                    <button
                        onClick={onRetry}
                        className="px-8 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-blue-500/20 active:scale-95"
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
            <div className="flex flex-col items-center justify-center py-12 lg:py-20 gap-6">
                <div className="w-16 h-16 rounded-3xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center border border-slate-100 dark:border-slate-800 shadow-xl">
                    <Search size={32} className="text-slate-400" />
                </div>
                <div className="text-center space-y-2">
                    <h3 className="text-lg lg:text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">No flights found</h3>
                    <p className="text-sm lg:text-base text-slate-500 font-medium max-w-sm mx-auto">{emptyMessage}</p>
                </div>
                <button
                    onClick={() => window.location.href = '/'}
                    className="px-8 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-black text-sm uppercase tracking-widest transition-all active:scale-95"
                >
                    New Search
                </button>
            </div>
        );
    }

    // Results
    return <PaginatedResults offers={offers} onSelect={onSelect} resetKey={offers} />;
};

// ─── Paginated Results ───────────────────────────────────────────────

function PaginatedResults({ offers, onSelect, resetKey }: { offers: FlightOffer[]; onSelect?: (offer: FlightOffer) => void; resetKey?: unknown }) {
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

    // Reset to first page whenever the offer list or filters change
    React.useEffect(() => { setVisibleCount(PAGE_SIZE); }, [resetKey]);

    const visible = offers.slice(0, visibleCount);
    const remaining = offers.length - visibleCount;
    const hasMore = remaining > 0;

    return (
        <div className="space-y-2 sm:space-y-3 lg:space-y-4">
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

            {hasMore && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="pt-6 pb-10 flex flex-col items-center gap-4"
                >
                    <div className="flex items-center gap-4 w-full max-w-xs">
                        <div className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">
                            Showing {visible.length} of {offers.length}
                        </p>
                        <div className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
                    </div>
                    <button
                        onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                        className="flex items-center gap-3 px-10 py-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-400 hover:shadow-2xl text-xs font-black text-slate-900 dark:text-white uppercase tracking-[0.2em] transition-all active:scale-95 shadow-sm"
                    >
                        <ChevronDown size={16} className="text-blue-500" strokeWidth={3} />
                        Load {Math.min(remaining, PAGE_SIZE)} More
                    </button>
                </motion.div>
            )}
        </div>
    );
}

export default FlightResults;
