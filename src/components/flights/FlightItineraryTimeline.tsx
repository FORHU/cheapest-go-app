'use client';

import React from 'react';
import { useTranslations, useLocale } from 'next-intl';
import type { OfferSlice } from '@/lib/flights/offer-slices';
import { sliceTimeline, type TimelineLeg, type TimelineStop } from '@/lib/flights/itinerary-timeline';
import type { FlightSegmentDetail } from '@/types/flights';
import { cabinLabel, formatDateTimeIn, formatDurationLong, formatTimeIn } from '@/utils/flight-utils';

type Translator = ReturnType<typeof useTranslations>;

/**
 * A row of independent facts, each shown after its own bullet.
 *
 * Every item stays its own element rather than being joined into one string, so a fact
 * like a terminal or an airport name can still be found and asserted on alone — the
 * bullet is decoration between them, not part of the text a reader (or a test) is
 * looking for. An item that is absent (no aircraft quoted, no city on record) is left
 * out entirely rather than shown as an empty bullet.
 */
function BulletLine({ items, className }: { items: React.ReactNode[]; className?: string }) {
    const shown = items.filter((item) => item !== undefined && item !== null && item !== '');
    if (shown.length === 0) return null;

    return (
        <span className={className}>
            {shown.map((item, i) => (
                <React.Fragment key={i}>
                    <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                        {i > 0 ? '  •  ' : '•  '}
                    </span>
                    {/* Its own element, not a bare text node beside the bullet — so the
                        fact alone, not the fact plus its neighbours' bullets, is what an
                        exact-text lookup (getByText, or a reader's screen zoom) finds. */}
                    <span>{item}</span>
                </React.Fragment>
            ))}
        </span>
    );
}

/** One end of a flight: the clock, what it is, the airport in full, and its terminal. */
function EndColumn({
    stop,
    segment,
    label,
    align,
}: {
    stop: TimelineStop;
    /** The flight this end belongs to — cabin, flight number and aircraft describe the
     *  whole flight, not just this end, but are shown at both ends so either one alone
     *  identifies the flight without a glance across the row. */
    segment: FlightSegmentDetail;
    label: string;
    align: 'left' | 'right';
}) {
    const locale = useLocale();
    const t = useTranslations('flights.itinerary');
    const alignment = align === 'left' ? 'text-left items-start' : 'text-right items-end';

    const airport = stop.airportName === stop.airportCode
        ? stop.airportCode
        : `${stop.airportName} (${stop.airportCode})`;

    // Which terminal, when the airline named one. A connection can land at one terminal
    // and leave from another, so this is per-end, not per-airport. When neither the
    // provider nor the standing table has one, say so rather than leaving it blank
    // beside an end that does have one — kept italic, as it was on its own line before,
    // so "we don't actually know" still reads differently from a confirmed fact.
    const terminal = stop.terminal
        ? t('terminal', { terminal: stop.terminal })
        : <em>{t('terminalUnavailable')}</em>;

    return (
        <div className={`flex w-[34%] shrink-0 flex-col gap-0.5 sm:w-[20%] ${alignment}`}>
            <span className="text-lg font-semibold leading-tight text-slate-900 dark:text-white lg:text-2xl">
                {formatTimeIn(stop.time, locale)}
            </span>
            <span className="text-[9px] uppercase tracking-wider text-slate-400 dark:text-slate-500 lg:text-[11px]">
                {label}
            </span>
            <BulletLine
                className="text-[11px] leading-snug text-slate-800 dark:text-slate-200 lg:text-[13px]"
                items={[stop.city, airport]}
            />
            <BulletLine
                className="text-[10px] leading-snug text-slate-500 dark:text-slate-400 lg:text-[12px]"
                items={[terminal, `${cabinLabel(segment.cabinClass)} ${segment.flightNumber}`, segment.aircraft]}
            />
        </div>
    );
}

/**
 * The rule between the two ends: how long the flight runs, written above it, and the
 * full date of each end written below, joined by an arrow — so a flight that leaves
 * after midnight says which day it leaves on rather than leaving the reader to infer
 * it, and the two dates read as one journey rather than two disconnected labels
 * pinned to opposite edges of the row.
 */
function FlightRule({ leg, t }: { leg: TimelineLeg; t: Translator }) {
    const locale = useLocale();
    const duration = formatDurationLong(leg.durationMinutes);

    return (
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1 px-2 pt-1.5">
            {duration && (
                <span className="text-center text-[10px] text-slate-400 dark:text-slate-500 lg:text-[12px]">
                    {t('flightDuration')}
                    <span className="ml-1 font-semibold text-slate-900 dark:text-white">{duration}</span>
                </span>
            )}
            <div className="w-full border-t border-dotted border-blue-300 dark:border-blue-800/60" />
            <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-center">
                <span className="text-[9px] leading-snug text-slate-400 dark:text-slate-500 lg:text-[11px]">
                    {formatDateTimeIn(leg.departure.time, locale)}
                </span>
                <span aria-hidden="true" className="text-[9px] text-slate-300 dark:text-slate-600 lg:text-[11px]">
                    →
                </span>
                <span className="text-[9px] leading-snug text-slate-400 dark:text-slate-500 lg:text-[11px]">
                    {formatDateTimeIn(leg.arrival.time, locale)}
                </span>
            </div>
        </div>
    );
}

/**
 * A break in the journey, named and timed. Rendered inline between two flights of a
 * single-leg itinerary, and between the legs of a multi-leg one — see
 * FlightItineraryDetails, which decides where it belongs.
 */
export function LayoverNote({ layover }: { layover: NonNullable<TimelineLeg['layover']> }) {
    const t = useTranslations('flights.itinerary');

    return (
        <div className="flex flex-col items-center gap-0.5 py-3 text-center">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 dark:text-slate-500 lg:text-[11px]">
                {t('layoverLabel')}
            </span>
            <span className="max-w-[210px] text-[11px] leading-snug text-slate-800 dark:text-slate-200 lg:text-[13px]">
                {t('layoverValue', {
                    duration: formatDurationLong(layover.minutes),
                    airport: layover.airportName,
                })}
            </span>
        </div>
    );
}

/**
 * One leg of an offer, flight by flight.
 *
 * Every figure belongs to the flight or the connection it sits on. The leg's own total
 * and the offer's totals describe a journey nobody boards, so neither appears here.
 */
export function FlightItineraryTimeline({
    slice,
    showLayovers = true,
}: {
    slice: OfferSlice;
    /**
     * Whether this leg spells out its connections. The card shows one layover for the
     * whole itinerary, so only the leading leg sets this — see FlightItineraryDetails.
     */
    showLayovers?: boolean;
}) {
    const t = useTranslations('flights.itinerary');
    const legs = sliceTimeline(slice);

    return (
        <div className="flex flex-col">
            {legs.map((leg, i) => (
                <div key={`${leg.segment.flightNumber}-${i}`} className="flex flex-col">
                    <div className="flex items-start justify-between gap-1 py-3 lg:gap-3">
                        <EndColumn stop={leg.departure} segment={leg.segment} label={t('departFrom')} align="left" />
                        <FlightRule leg={leg} t={t} />
                        <EndColumn stop={leg.arrival} segment={leg.segment} label={t('arriveAt')} align="right" />
                    </div>

                    {showLayovers && leg.layover && <LayoverNote layover={leg.layover} />}
                </div>
            ))}
        </div>
    );
}
