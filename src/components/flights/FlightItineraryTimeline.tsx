'use client';

import React from 'react';
import { useTranslations, useLocale } from 'next-intl';
import type { OfferSlice } from '@/lib/flights/offer-slices';
import { sliceTimeline, type TimelineLeg, type TimelineStop } from '@/lib/flights/itinerary-timeline';
import type { FlightSegmentDetail } from '@/types/flights';
import { cabinLabel, formatDateTimeIn, formatDurationLong } from '@/utils/flight-utils';
import { EndClock, airportLabel } from './FlightEndpoint';

type Translator = ReturnType<typeof useTranslations>;

/**
 * A list of independent facts, one to a line.
 *
 * Every item stays its own element rather than being joined into one string, so a fact
 * like a terminal or a date can still be found and asserted on alone. An item that is
 * absent (no aircraft quoted) is left out entirely rather than shown as an empty line.
 *
 * The departure column's facts hang off disc bullets on their left; the arrival column
 * mirrors it, each fact running flush to the right edge with its dot after the words, on
 * the right. The left bullets are list markers and the right dots are aria-hidden
 * elements, so neither is part of the text a reader (or a test) is looking for.
 */
function FactList({ items, align }: { items: React.ReactNode[]; align: 'left' | 'right' }) {
    const shown = items.filter((item) => item !== undefined && item !== null && item !== '');
    if (shown.length === 0) return null;

    const right = align === 'right';

    return (
        <ul
            className={`flex flex-col gap-0.5 text-[10px] leading-snug text-slate-900 dark:text-slate-200 lg:text-[12px] ${
                right ? 'list-none items-end text-right' : 'list-disc items-start ps-[18px] text-left marker:text-slate-900 dark:marker:text-slate-400'
            }`}
        >
            {shown.map((item, i) => (
                <li key={i} className={right ? 'flex items-center gap-1.5' : undefined}>
                    <span>{item}</span>
                    {/* A list marker cannot sit on the right, so the arrival's dot is drawn —
                        the size and colour of the departure's disc marker. */}
                    {right && (
                        <span
                            data-fact-dot
                            aria-hidden="true"
                            className="size-[5px] shrink-0 rounded-full bg-slate-900 dark:bg-slate-400"
                        />
                    )}
                </li>
            ))}
        </ul>
    );
}

/**
 * One end of a flight: the clock and its plane glyph, the airport in full, then what the
 * traveller needs at that airport — the date and time, the terminal, the cabin and flight,
 * the aircraft — under DEPART FROM or ARRIVE AT.
 */
function EndColumn({
    stop,
    segment,
    departedAt,
    label,
    align,
}: {
    stop: TimelineStop;
    /** The flight this end belongs to — cabin, flight number and aircraft describe the
     *  whole flight, not just this end, but are shown at both ends so either one alone
     *  identifies the flight without a glance across the row. */
    segment: FlightSegmentDetail;
    /** For the arrival end: when this flight left, for the "+ 1" on an overnight landing. */
    departedAt?: string;
    label: string;
    align: 'left' | 'right';
}) {
    const locale = useLocale();
    const t = useTranslations('flights.itinerary');
    const alignment = align === 'left' ? 'text-left items-start' : 'text-right items-end';

    // Which terminal, when the airline named one. A connection can land at one terminal
    // and leave from another, so this is per-end, not per-airport. When neither the
    // provider nor the standing table has one, say so rather than leaving it blank
    // beside an end that does have one — kept italic, so "we don't actually know" still
    // reads differently from a confirmed fact.
    const terminal = stop.terminal
        ? t('terminal', { terminal: stop.terminal })
        : <em>{t('terminalUnavailable')}</em>;

    return (
        <div className={`flex w-[36%] shrink-0 flex-col gap-0.5 sm:w-[28%] ${alignment}`}>
            <EndClock
                time={stop.time}
                departedAt={departedAt}
                end={align === 'left' ? 'departure' : 'arrival'}
                glyph={false}
            />
            <span className="text-[10px] leading-snug text-slate-900 dark:text-slate-200 lg:text-[12px]">
                {airportLabel(stop.airportCode, stop.airportName)}
            </span>
            <span className="mt-2 text-[10px] uppercase text-slate-900 dark:text-slate-300 lg:text-[12px]">
                {label}
            </span>
            <FactList
                align={align}
                items={[
                    formatDateTimeIn(stop.time, locale),
                    terminal,
                    `${cabinLabel(segment.cabinClass)} ${segment.flightNumber}`,
                    segment.aircraft,
                ]}
            />
        </div>
    );
}

/**
 * The rule between the two ends, with how long the flight runs written over it. The dates
 * of each end sit in the end's own column, beneath DEPART FROM and ARRIVE AT.
 */
function FlightRule({ leg, t }: { leg: TimelineLeg; t: Translator }) {
    const duration = formatDurationLong(leg.durationMinutes);

    return (
        <div className="flex min-w-0 flex-1 flex-col gap-1 px-1 lg:px-2">
            {duration && (
                <span className="text-center text-[10px] text-slate-600 dark:text-slate-400 lg:text-[12px]">
                    {t('flightDuration')}
                    <span className="ml-1 text-slate-900 dark:text-white">{duration}</span>
                </span>
            )}
            <div className="w-full border-t border-dotted border-blue-600 dark:border-blue-500/70" />
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
        <div className="flex flex-col items-center gap-1.5 py-3 text-center">
            {/* A pill, not another muted caption: the wait between flights is the
                thing a traveller scanning a connection most needs to see. */}
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 lg:text-[11px]">
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
                        <EndColumn stop={leg.arrival} segment={leg.segment} departedAt={leg.departure.time} label={t('arriveAt')} align="right" />
                    </div>

                    {showLayovers && leg.layover && <LayoverNote layover={leg.layover} />}
                </div>
            ))}
        </div>
    );
}
