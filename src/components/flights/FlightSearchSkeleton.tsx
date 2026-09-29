import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { Skeleton } from '@/components/shared/Skeleton/Skeleton';
import { FilterCard } from '@/components/flights/FilterCard';
import { FlightCardSkeleton } from '@/components/flights/flightResultsList';

/*
 * The flight results page while a fresh search navigates to it, drawn from
 * the page's own markup so nothing moves when the page arrives:
 *
 *   flights/search/page.tsx — the back button, the route title over its
 *     subtitle, and the price-alert button beside them;
 *   ResponsiveFlightHeader  — the route card that stands in for them on phones;
 *   SearchFetcher           — the 288px filter column beside the results;
 *   filters.tsx             — the panel as it reads once the results are in,
 *     which is what replaces this: Sort by, Airlines, Stops, Price per
 *     person, Times and Flight duration, each ruled off from the last;
 *   flightResultsList.tsx   — the result card placeholder, spaced as the list
 *     spaces its cards.
 *
 * Every size below is the real element's; the comment beside each names it.
 * Text is a bar; the controls around it (switches, boxes, fields, the slider)
 * are drawn as their own shapes, since those are the panel's design.
 */

type SectionName = 'sort' | 'airlines' | 'stops' | 'price' | 'times' | 'duration';

/** A filter section, ruled off from the one above it unless it comes first (filters.tsx `Section`). */
function FilterSection({ name, first = false, titleWidth, children }: {
    name:       SectionName;
    first?:     boolean;
    titleWidth: number;
    children:   React.ReactNode;
}) {
    return (
        <section data-section={name} className={first ? '' : 'border-t border-slate-100 dark:border-slate-800 pt-4 mt-4'}>
            {/* The heading: 12px bold uppercase on the inherited 1.5 line — an 18px row — mb-2 */}
            <div className="flex items-center h-[18px] mb-2">
                <Skeleton width={titleWidth} height={10} />
            </div>
            {children}
        </section>
    );
}

/**
 * One single-select row — px-3 py-2 around 15px type (filters.tsx `OptionRow`).
 * The chosen one is filled, as "Cheapest First" is on arrival.
 */
function OptionRowSkeleton({ width, selected = false, count = false }: { width: number; selected?: boolean; count?: boolean }) {
    return (
        <div className={`flex h-[38.5px] w-full items-center justify-between rounded-md px-3 ${selected ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`}>
            <Skeleton width={width} height={12} className={selected ? '!bg-blue-100 dark:!bg-blue-800/50' : ''} />
            {count && <Skeleton width={7} height={9} />}
        </div>
    );
}

/** The 32 × 20 switch (filters.tsx `Toggle`). */
function ToggleShape() {
    return (
        <div className="relative h-5 w-8 shrink-0 rounded-full bg-slate-200 dark:bg-slate-700">
            <span className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-white shadow" />
        </div>
    );
}

/** A label with its switch — "Select all airlines", "Refundable" (12px type beside a `Toggle`). */
function ToggleRow({ width, className = '' }: { width: number; className?: string }) {
    return (
        <div className={`flex items-center justify-between gap-2 ${className}`}>
            <Skeleton width={width} height={10} />
            <ToggleShape />
        </div>
    );
}

/** A 32px field drawn as the field itself (filters.tsx `CommitField`). */
function FieldOutline({ className = 'flex-1 min-w-0' }: { className?: string }) {
    return <div className={`h-8 rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 ${className}`} />;
}

/** A from–to pair of fields (filters.tsx `timeFields` and the price pair). */
function FieldPair({ className = '' }: { className?: string }) {
    return (
        <div className={`flex w-full items-center gap-1.5 ${className}`}>
            <FieldOutline />
            <span className="text-slate-400">–</span>
            <FieldOutline />
        </div>
    );
}

/** A day window under its 15px label (filters.tsx `timeFields`). */
function TimeWindowSkeleton({ labelWidth, className = '' }: { labelWidth: number; className?: string }) {
    return (
        <div className={className}>
            <div className="flex h-[22.5px] items-center mb-1">
                <Skeleton width={labelWidth} height={12} />
            </div>
            <FieldPair />
        </div>
    );
}

/** The panel as the loaded page shows it. */
function FilterPanelSkeleton() {
    return (
        <div className="flex flex-col animate-pulse">
            <FilterSection name="sort" first titleWidth={52}>
                <div className="flex flex-col gap-0.5">
                    <OptionRowSkeleton width={104} selected />
                    <OptionRowSkeleton width={86} />
                    <OptionRowSkeleton width={128} />
                </div>
            </FilterSection>

            {/* Airlines: the select-all switch over the first names, each a 14px box, py-1 around 15px type */}
            <FilterSection name="airlines" titleWidth={56}>
                <div className="flex flex-col gap-1">
                    <ToggleRow width={96} className="mb-1" />
                    {[112, 108, 64, 56].map((width, i) => (
                        <div key={i} className="flex h-[30.5px] items-center gap-3">
                            <div className="h-3.5 w-3.5 shrink-0 rounded-[2px] bg-slate-200 dark:bg-slate-700" />
                            <div className="flex-1"><Skeleton width={width} height={12} /></div>
                            <Skeleton width={7} height={9} />
                        </div>
                    ))}
                </div>
            </FilterSection>

            <FilterSection name="stops" titleWidth={40}>
                <div className="flex flex-col gap-0.5">
                    <OptionRowSkeleton width={48} count />
                    <OptionRowSkeleton width={46} count />
                    <OptionRowSkeleton width={66} count />
                </div>
            </FilterSection>

            {/* Price per person: the refundable switch, the two amounts, and the slider under them */}
            <FilterSection name="price" titleWidth={112}>
                <ToggleRow width={64} className="mb-2" />
                <FieldPair className="mb-2" />
                {/* RangeSlider: a 16px band, an 8px track, 16px thumbs at either end */}
                <div className="relative h-4 w-full">
                    <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-slate-200 dark:bg-slate-700" />
                    <span className="absolute left-0 top-0 h-4 w-4 rounded-full bg-slate-300 dark:bg-slate-600" />
                    <span className="absolute right-0 top-0 h-4 w-4 rounded-full bg-slate-300 dark:bg-slate-600" />
                </div>
            </FilterSection>

            <FilterSection name="times" titleWidth={44}>
                <TimeWindowSkeleton labelWidth={70} className="mb-3" />
                <TimeWindowSkeleton labelWidth={50} />
            </FilterSection>

            {/* Flight duration: "Under [ 56px field ] hours" on one 15px line */}
            <FilterSection name="duration" titleWidth={108}>
                <div className="mb-1 flex items-center gap-1.5">
                    <Skeleton width={42} height={12} />
                    <FieldOutline className="w-14" />
                    <Skeleton width={38} height={12} />
                </div>
            </FilterSection>
        </div>
    );
}

export function FlightSearchSkeleton() {
    return (
        <div
            role="status"
            aria-busy="true"
            aria-label="Loading flights"
            className="min-h-screen pt-2 pb-12 px-4 md:pt-6 md:pb-20 overflow-x-hidden"
        >
            <div className="max-w-7xl mx-auto space-y-3 lg:space-y-6">
                {/* ─── Desktop: back button, route title + subtitle, price-alert button ─── */}
                <div data-skeleton="page-header" className="hidden lg:block">
                    {/* BackButton: 40px circle, white with a hairline and a small shadow */}
                    <div className="mb-3 w-10 h-10 rounded-full bg-white/90 dark:bg-slate-900/90 border border-slate-200/50 dark:border-slate-700/50 shadow-sm flex items-center justify-center text-slate-700 dark:text-slate-300">
                        <ChevronLeft size={20} />
                    </div>
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        {/* SectionHeader (size sm): an 18px/28px title over a 14px/20px subtitle */}
                        <div className="animate-pulse">
                            <div className="flex h-7 items-center">
                                <Skeleton width={380} height={18} rounded="md" />
                            </div>
                            <div className="flex h-5 items-center mt-1.5">
                                <Skeleton width={260} height={12} rounded="md" />
                            </div>
                        </div>
                        {/* PriceAlertButton: a 12px label in a bordered rounded-xl, px-3 py-1.5 */}
                        <div className="flex h-[30px] w-[110px] items-center gap-1.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 animate-pulse">
                            <Skeleton width={13} height={13} rounded="full" />
                            <Skeleton width={80} height={9} />
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-3 lg:gap-6 relative pb-24">
                    {/* ─── Phones: ResponsiveFlightHeader's route card ─── */}
                    <div className="lg:hidden w-full py-1">
                        <div className="flex flex-col gap-2 w-full bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800 p-4 shadow-lg ring-1 ring-black/5 animate-pulse">
                            <div className="flex items-center justify-between w-full">
                                <div className="flex-1 min-w-0 pr-3 space-y-1.5">
                                    <Skeleton width="70%" height={12} />
                                    <Skeleton width="50%" height={9} />
                                </div>
                                {/* The filter button: p-2.5 around an 18px glyph */}
                                <div className="w-[38px] h-[38px] shrink-0 rounded-xl bg-slate-50 dark:bg-slate-800" />
                            </div>
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/50">
                                <Skeleton width={120} height={9} />
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col lg:flex-row gap-6 lg:items-start items-stretch">
                        {/* ─── Filter column: the 288px FilterCard ─── */}
                        <div data-skeleton="filters" className="hidden lg:block w-72 shrink-0">
                            <FilterCard>
                                <FilterPanelSkeleton />
                            </FilterCard>
                        </div>

                        {/* ─── Results: the list's own placeholder cards ─── */}
                        <div data-skeleton="results" className="flex-1 min-w-0 space-y-3">
                            {[0, 1, 2, 3, 4].map(i => <FlightCardSkeleton key={i} index={i} />)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
