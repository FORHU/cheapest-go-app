'use client';

import React from 'react';
import { useTranslations, useLocale } from 'next-intl';
import type { OfferSlice } from '@/lib/flights/offer-slices';
import { sliceTimeline, type TimelineLeg, type TimelineStop } from '@/lib/flights/itinerary-timeline';
import { formatDateTimeIn, formatDurationLong, formatTimeIn } from '@/utils/flight-utils';

type Translator = ReturnType<typeof useTranslations>;

/** One end of a flight: the clock, what it is, and the airport in full beneath. */
function EndColumn({
    stop,
    label,
    align,
}: {
    stop: TimelineStop;
    label: string;
    align: 'left' | 'right';
}) {
    const locale = useLocale();
    const alignment = align === 'left' ? 'text-left items-start' : 'text-right items-end';

    return (
        <div className={`flex w-[34%] shrink-0 flex-col gap-0.5 sm:w-[20%] ${alignment}`}>
            <span className="text-lg font-semibold leading-tight text-slate-900 dark:text-white lg:text-2xl">
                {formatTimeIn(stop.time, locale)}
            </span>
            <span className="text-[9px] uppercase tracking-wider text-slate-400 dark:text-slate-500 lg:text-[11px]">
                {label}
            </span>
            <span className="text-[11px] leading-snug text-slate-800 dark:text-slate-200 lg:text-[13px]">
                {stop.airportName === stop.airportCode
                    ? stop.airportCode
                    : `${stop.airportName} (${stop.airportCode})`}
            </span>
        </div>
    );
}

/**
 * The rule between the two ends: how long the flight runs, written above it, and the
 * full date of each end written below — so a flight that leaves after midnight says
 * which day it leaves on rather than leaving the reader to infer it.
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
            <div className="flex w-full items-start justify-between gap-2">
                <span className="text-[9px] leading-snug text-slate-400 dark:text-slate-500 lg:text-[11px]">
                    {formatDateTimeIn(leg.departure.time, locale)}
                </span>
                <span className="text-right text-[9px] leading-snug text-slate-400 dark:text-slate-500 lg:text-[11px]">
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
                        <EndColumn stop={leg.departure} label={t('departFrom')} align="left" />
                        <FlightRule leg={leg} t={t} />
                        <EndColumn stop={leg.arrival} label={t('arriveAt')} align="right" />
                    </div>

                    {showLayovers && leg.layover && <LayoverNote layover={leg.layover} />}
                </div>
            ))}
        </div>
    );
}
