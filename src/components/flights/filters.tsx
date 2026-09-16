"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import type { FlightOffer } from "@/types/flights";
import { formatCurrency } from "@/lib/utils";
import { RangeSlider } from "@/components/ui/RangeSlider";
import {
    DAY_END_MINUTE,
    DAY_START_MINUTE,
    DEFAULT_FLIGHT_FILTERS,
    filterBounds,
    offerAirline,
    offerArrivalAirport,
    offerMatchesStops,
    type FlightFilterState,
} from "@/lib/flights/filter-offers";

export type { FlightProvider } from "@/lib/flights/filter-offers";
/** The panel's own name for the shape it edits, kept for the screen that consumes it. */
export type FilterState = FlightFilterState;

interface FlightFiltersProps {
    onFilterChange: (filters: FlightFilterState) => void;
    className?: string;
    /** All unfiltered offers — the source of every slider bound, list and count. */
    allOffers?: FlightOffer[];
    /** Increment to programmatically reset filters (e.g. from a "clear all" outside). */
    resetKey?: number;
}

/** How many options a list shows before it asks to be expanded. */
const COLLAPSED_LIST_LENGTH = 5;

function minutesToClock(minute: number): string {
    const h = Math.floor(minute / 60);
    const m = minute % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ── Pieces the panel repeats ─────────────────────────────────────────

/** A titled group, ruled off from the one above it, with an optional reset. */
function Section({
    title,
    onReset,
    resetLabel,
    first = false,
    children,
}: {
    title: string;
    onReset?: () => void;
    resetLabel: string;
    first?: boolean;
    children: React.ReactNode;
}) {
    return (
        <section className={first ? '' : 'border-t border-slate-100 dark:border-slate-800 pt-4 mt-4'}>
            <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="text-[12px] font-bold uppercase text-[#939fb1] dark:text-slate-400">
                    {title}
                </h3>
                {/* Only offered once the section has something to undo. */}
                {onReset && (
                    <button
                        onClick={onReset}
                        className="text-[13px] text-blue-600 dark:text-blue-400 hover:underline"
                    >
                        {resetLabel}
                    </button>
                )}
            </div>
            {children}
        </section>
    );
}

/** One choice in a single-select group — the design fills the chosen row rather than ticking it. */
function OptionRow({
    label,
    count,
    selected,
    onSelect,
}: {
    label: string;
    count?: number;
    selected: boolean;
    onSelect: () => void;
}) {
    return (
        <button
            onClick={onSelect}
            aria-pressed={selected}
            className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[15px] transition-colors ${
                selected
                    ? 'bg-blue-50 text-[#4e80ef] dark:bg-blue-900/30 dark:text-blue-400'
                    : 'text-[#444] hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/50'
            }`}
        >
            <span>{label}</span>
            {count !== undefined && <span className="text-[11px] opacity-60">{count}</span>}
        </button>
    );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <button
            role="switch"
            aria-checked={checked}
            aria-label={label}
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-6 w-10 shrink-0 rounded-full transition-colors duration-200 ${
                checked ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'
            }`}
        >
            <span
                className={`mt-0.5 inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                    checked ? 'translate-x-[18px]' : 'translate-x-0.5'
                }`}
            />
        </button>
    );
}

/**
 * A checkbox list with a select-all switch above it.
 *
 * Empty selection means "no restriction", which is also what every box ticked means. The
 * switch writes whichever of the two the traveller asked for, so the list and the filter
 * never disagree about what an untouched panel does.
 */
function CheckList({
    options,
    selected,
    onChange,
    selectAllLabel,
    showAllLabel,
    showLessLabel,
    counts,
}: {
    options: string[];
    selected: string[];
    onChange: (next: string[]) => void;
    selectAllLabel: string;
    showAllLabel: string;
    showLessLabel: string;
    counts?: Record<string, number>;
}) {
    const [expanded, setExpanded] = useState(false);
    if (options.length === 0) return null;

    const allSelected = selected.length === 0 || selected.length === options.length;
    const shown = expanded ? options : options.slice(0, COLLAPSED_LIST_LENGTH);

    const toggleOne = (option: string) => {
        // An untouched list reads as "everything"; the first tick has to start from that,
        // or unticking one airline would silently select only that airline.
        const base = selected.length === 0 ? options : selected;
        const next = base.includes(option) ? base.filter(o => o !== option) : [...base, option];
        onChange(next.length === options.length ? [] : next);
    };

    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[12px] text-slate-900 dark:text-slate-200">{selectAllLabel}</span>
                <Toggle
                    checked={allSelected}
                    label={selectAllLabel}
                    onChange={on => onChange(on ? [] : [options[0]])}
                />
            </div>

            {shown.map(option => {
                const checked = selected.length === 0 || selected.includes(option);
                return (
                    <label key={option} className="flex cursor-pointer items-center gap-3 py-1">
                        <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleOne(option)}
                            className="h-3.5 w-3.5 shrink-0 rounded-none border border-[#444] text-blue-600 focus:ring-blue-500 dark:border-slate-500 dark:bg-slate-800"
                        />
                        <span className="flex-1 text-[15px] text-[#444] dark:text-slate-300">{option}</span>
                        {counts && <span className="text-[11px] text-slate-400">{counts[option] ?? 0}</span>}
                    </label>
                );
            })}

            {options.length > COLLAPSED_LIST_LENGTH && (
                <button
                    onClick={() => setExpanded(v => !v)}
                    className="mt-1 inline-flex items-center justify-center gap-1 self-center text-[12px] text-[#444] hover:text-blue-600 dark:text-slate-400"
                >
                    <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    {expanded ? showLessLabel : showAllLabel}
                </button>
            )}
        </div>
    );
}

// ── Panel ────────────────────────────────────────────────────────────

export default function FlightFilters({
    onFilterChange,
    className,
    allOffers = [],
    resetKey,
}: FlightFiltersProps) {
    const t = useTranslations('flights.filtersPanel');
    const [state, setState] = useState<FlightFilterState>(DEFAULT_FLIGHT_FILTERS);

    const bounds = useMemo(() => filterBounds(allOffers), [allOffers]);
    const currency = allOffers[0]?.price?.currency ?? 'USD';

    // Allow the screen to force-reset the panel.
    useEffect(() => {
        if (resetKey === undefined) return;
        setState(DEFAULT_FLIGHT_FILTERS);
        onFilterChange(DEFAULT_FLIGHT_FILTERS);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resetKey]);

    const update = (patch: Partial<FlightFilterState>) => {
        const next = { ...state, ...patch };
        setState(next);
        onFilterChange(next);
    };

    // Counts come from the unfiltered set, so an option never reads as empty just because
    // another filter is currently hiding its results.
    const counts = useMemo(() => {
        const airlines: Record<string, number> = {};
        const airports: Record<string, number> = {};
        for (const offer of allOffers) {
            const airline = offerAirline(offer);
            if (airline) airlines[airline] = (airlines[airline] ?? 0) + 1;
            const airport = offerArrivalAirport(offer);
            if (airport) airports[airport] = (airports[airport] ?? 0) + 1;
        }
        return { airlines, airports };
    }, [allOffers]);

    const stopCount = (stops: FlightFilterState['stops']) =>
        allOffers.filter(o => offerMatchesStops(o, stops)).length;

    const priceRange = state.priceRange ?? bounds.price;
    const departureWindow = state.departureWindow ?? [DAY_START_MINUTE, DAY_END_MINUTE];
    const arrivalWindow = state.arrivalWindow ?? [DAY_START_MINUTE, DAY_END_MINUTE];
    const maxDuration = state.maxDurationMinutes ?? bounds.duration[1];
    const refundableCount = allOffers.filter(o => (o.farePolicy?.isRefundable ?? o.refundable) === true).length;

    const hasPriceSpread = bounds.price[1] > bounds.price[0];
    const hasDurationSpread = bounds.duration[1] > bounds.duration[0];

    return (
        <div className={`flex flex-col ${className ?? ''}`}>
            {/* ── Sort ── */}
            <Section title={t('sortBy')} resetLabel={t('reset')} first>
                <div className="flex flex-col gap-0.5">
                    <OptionRow
                        label={t('cheapestFirst')}
                        selected={state.sortBy === 'price'}
                        onSelect={() => update({ sortBy: 'price' })}
                    />
                    <OptionRow
                        label={t('fastestFirst')}
                        selected={state.sortBy === 'duration'}
                        onSelect={() => update({ sortBy: 'duration' })}
                    />
                    <OptionRow
                        label={t('earliestDeparture')}
                        selected={state.sortBy === 'departure'}
                        onSelect={() => update({ sortBy: 'departure' })}
                    />
                </div>
            </Section>

            {/* ── Airlines ── */}
            {bounds.airlines.length > 0 && (
                <Section
                    title={t('airlines')}
                    resetLabel={t('reset')}
                    onReset={state.selectedAirlines.length > 0 ? () => update({ selectedAirlines: [] }) : undefined}
                >
                    <CheckList
                        options={bounds.airlines}
                        selected={state.selectedAirlines}
                        onChange={next => update({ selectedAirlines: next })}
                        selectAllLabel={t('selectAllAirlines')}
                        showAllLabel={t('showAll')}
                        showLessLabel={t('showLess')}
                        counts={counts.airlines}
                    />
                </Section>
            )}

            {/* ── Stops ── */}
            <Section
                title={t('stops')}
                resetLabel={t('reset')}
                onReset={state.stops !== null ? () => update({ stops: null }) : undefined}
            >
                <div className="flex flex-col gap-0.5">
                    <OptionRow
                        label={t('direct')}
                        count={allOffers.length > 0 ? stopCount(0) : undefined}
                        selected={state.stops === 0}
                        onSelect={() => update({ stops: state.stops === 0 ? null : 0 })}
                    />
                    <OptionRow
                        label={t('oneStop')}
                        count={allOffers.length > 0 ? stopCount(1) : undefined}
                        selected={state.stops === 1}
                        onSelect={() => update({ stops: state.stops === 1 ? null : 1 })}
                    />
                    <OptionRow
                        label={t('twoStopsPlus')}
                        count={allOffers.length > 0 ? stopCount(2) : undefined}
                        selected={state.stops === 2}
                        onSelect={() => update({ stops: state.stops === 2 ? null : 2 })}
                    />
                </div>
            </Section>

            {/* ── Price per person ── */}
            <Section
                title={t('pricePerPerson')}
                resetLabel={t('reset')}
                onReset={
                    state.priceRange || state.refundableOnly
                        ? () => update({ priceRange: null, refundableOnly: false })
                        : undefined
                }
            >
                <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[12px] text-slate-900 dark:text-slate-200">{t('refundable')}</span>
                    <Toggle
                        checked={state.refundableOnly}
                        label={t('refundable')}
                        onChange={v => update({ refundableOnly: v })}
                    />
                </div>
                {state.refundableOnly && refundableCount === 0 && allOffers.length > 0 && (
                    <p className="mb-2 text-[11px] text-amber-600 dark:text-amber-400">
                        {t('refundableFaresDescription')}
                    </p>
                )}
                {hasPriceSpread && (
                    <>
                        <p className="mb-1 text-right text-[14px] text-slate-900 dark:text-slate-200">
                            {formatCurrency(priceRange[0], currency)} – {formatCurrency(priceRange[1], currency)}
                        </p>
                        <RangeSlider
                            label={t('pricePerPerson')}
                            min={bounds.price[0]}
                            max={bounds.price[1]}
                            value={priceRange}
                            onChange={next => update({ priceRange: next })}
                            formatValue={v => formatCurrency(v, currency)}
                        />
                    </>
                )}
            </Section>

            {/* ── Times ── */}
            <Section
                title={t('times')}
                resetLabel={t('reset')}
                onReset={
                    state.departureWindow || state.arrivalWindow
                        ? () => update({ departureWindow: null, arrivalWindow: null })
                        : undefined
                }
            >
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[15px] text-slate-900 dark:text-slate-200">{t('departure')}</span>
                    <span className="text-[13px] text-slate-500 dark:text-slate-400">
                        {minutesToClock(departureWindow[0])} - {minutesToClock(departureWindow[1])}
                    </span>
                </div>
                <RangeSlider
                    className="mb-3 mt-1"
                    label={t('departure')}
                    min={DAY_START_MINUTE}
                    max={DAY_END_MINUTE}
                    step={5}
                    value={departureWindow}
                    onChange={next => update({ departureWindow: next })}
                    formatValue={minutesToClock}
                />

                <div className="flex items-center justify-between gap-2">
                    <span className="text-[15px] text-slate-900 dark:text-slate-200">{t('arrival')}</span>
                    <span className="text-[13px] text-slate-500 dark:text-slate-400">
                        {minutesToClock(arrivalWindow[0])} - {minutesToClock(arrivalWindow[1])}
                    </span>
                </div>
                <RangeSlider
                    className="mt-1"
                    label={t('arrival')}
                    min={DAY_START_MINUTE}
                    max={DAY_END_MINUTE}
                    step={5}
                    value={arrivalWindow}
                    onChange={next => update({ arrivalWindow: next })}
                    formatValue={minutesToClock}
                />
            </Section>

            {/* ── Flight duration ──
                One knob in the design, so the lower end is pinned to the shortest flight
                on offer and only the ceiling moves. */}
            {hasDurationSpread && (
                <Section
                    title={t('flightDuration')}
                    resetLabel={t('reset')}
                    onReset={state.maxDurationMinutes !== null ? () => update({ maxDurationMinutes: null }) : undefined}
                >
                    <p className="mb-1 text-[15px] text-slate-900 dark:text-slate-200">
                        {t('underHours', { hours: Math.ceil(maxDuration / 60) })}
                    </p>
                    <RangeSlider
                        label={t('flightDuration')}
                        min={bounds.duration[0]}
                        max={bounds.duration[1]}
                        step={15}
                        value={[bounds.duration[0], maxDuration]}
                        onChange={([, high]) => update({ maxDurationMinutes: high })}
                        formatValue={v => `${Math.floor(v / 60)}h ${String(v % 60).padStart(2, '0')}m`}
                    />
                </Section>
            )}

            {/* ── Arrival airports ── */}
            {bounds.arrivalAirports.length > 1 && (
                <Section
                    title={t('arrivalAirports')}
                    resetLabel={t('reset')}
                    onReset={
                        state.selectedArrivalAirports.length > 0
                            ? () => update({ selectedArrivalAirports: [] })
                            : undefined
                    }
                >
                    <CheckList
                        options={bounds.arrivalAirports}
                        selected={state.selectedArrivalAirports}
                        onChange={next => update({ selectedArrivalAirports: next })}
                        selectAllLabel={t('selectAllAirports')}
                        showAllLabel={t('showAll')}
                        showLessLabel={t('showLess')}
                        counts={counts.airports}
                    />
                </Section>
            )}
        </div>
    );
}
