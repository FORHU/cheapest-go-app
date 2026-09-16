'use client';

import React from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Calendar } from 'lucide-react';
import type { OfferSlice } from '@/lib/flights/offer-slices';
import { sliceTimeline, type TimelineLeg, type TimelineStop } from '@/lib/flights/itinerary-timeline';
import type { FlightSegmentDetail } from '@/types/flights';
import { cabinLabel, formatDateTimeIn, formatDurationLong, formatTimeIn } from '@/utils/flight-utils';

type Translator = ReturnType<typeof useTranslations>;

/**
 * A list of independent facts, one to a line, each after its own bullet.
 *
 * Every item stays its own element rather than being joined into one string, so a fact
 * like a terminal or an airport name can still be found and asserted on alone — the
 * bullet is decoration beside them, not part of the text a reader (or a test) is
 * looking for. An item that is absent (no aircraft quoted, no city on record) is left
 * out entirely rather than shown as an empty bullet.
 *
 * The bullet sits in a flex column of its own, so a fact long enough to wrap hangs under
 * itself rather than under its bullet. Each line follows the end it belongs to: the
 * arrival column's lines run to the right edge, as everything else in that column does,
 * and its bullets are mirrored to the trailing edge so they line up down one edge instead
 * of scattering down the ragged one. Mirrored by flex order rather than by markup, so the
 * bullet stays first in the DOM — it is aria-hidden either way, and one ordering of the
 * two elements is easier to keep right than two.
 */
function BulletLine({
    items,
    className,
    align = 'left',
}: {
    items: React.ReactNode[];
    className?: string;
    align?: 'left' | 'right';
}) {
    const shown = items.filter((item) => item !== undefined && item !== null && item !== '');
    if (shown.length === 0) return null;

    const right = align === 'right';
    const alignment = right ? 'items-end text-right' : 'items-start text-left';

    return (
        <span className={`flex flex-col ${alignment} ${className ?? ''}`}>
            {shown.map((item, i) => (
                <span key={i} className={`flex gap-1.5 ${right ? 'flex-row-reverse' : ''}`}>
                    <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">•</span>
                    {/* Its own element, not a bare text node beside the bullet — so the
                        fact alone, not the fact plus its bullet, is what an exact-text
                        lookup (getByText, or a reader's screen zoom) finds. */}
                    <span>{item}</span>
                </span>
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
            <span className="text-lg leading-tight text-slate-900 dark:text-white lg:text-2xl">
                {formatTimeIn(stop.time, locale)}
            </span>
            <span className="text-[10px] uppercase text-[#939fb1] dark:text-slate-500 lg:text-[12px]">
                {label}
            </span>
            {/* Where you are, then what you are on. Both read in near-black; only the
                second line carries weight, because the terminal and flight are what a
                traveller acts on once they are already at the airport. */}
            <BulletLine
                align={align}
                className="text-[11px] leading-snug text-slate-900 dark:text-slate-200 lg:text-[13px]"
                items={[stop.city, airport]}
            />
            <BulletLine
                align={align}
                className="text-[10px] font-bold leading-snug text-slate-900 dark:text-white lg:text-[12px]"
                items={[terminal, `${cabinLabel(segment.cabinClass)} ${segment.flightNumber}`, segment.aircraft]}
            />
        </div>
    );
}

/**
 * The rule between the two ends: how long the flight runs, written above it, and the
 * full date of each end written below — so a flight that leaves after midnight says
 * which day it leaves on rather than leaving the reader to infer it.
 *
 * The dates sit at opposite ends of the rule, each under the clock it belongs to, with
 * the arrow trailing the departure: the row reads left to right as the flight does.
 */
function FlightRule({ leg, t }: { leg: TimelineLeg; t: Translator }) {
    const locale = useLocale();
    const duration = formatDurationLong(leg.durationMinutes);

    return (
        <div className="flex min-w-0 flex-1 flex-col gap-1 px-2 pt-1.5">
            {duration && (
                <span className="text-center text-[10px] text-[#939fb1] dark:text-slate-500 lg:text-[12px]">
                    {t('flightDuration')}
                    <span className="ml-1 text-slate-900 dark:text-white">{duration}</span>
                </span>
            )}
            <div className="w-full border-t border-dotted border-blue-600 dark:border-blue-500/70" />
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[10px] leading-snug text-slate-900 dark:text-slate-300 lg:text-[12px]">
                <span className="inline-flex min-w-0 items-center gap-1">
                    <Calendar aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
                    {formatDateTimeIn(leg.departure.time, locale)}
                    <span aria-hidden="true">→</span>
                </span>
                <span className="min-w-0 text-right">
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
            <span className="text-[10px] uppercase text-[#939fb1] dark:text-slate-500 lg:text-[12px]">
                {t('layoverLabel')}
            </span>
            <span className="text-[11px] leading-snug text-slate-900 dark:text-slate-200 lg:text-[13px]">
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
