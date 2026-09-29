'use client';

import React from 'react';
import { useLocale } from 'next-intl';
import { getAirportByCode } from '@/lib/airports';
import { dayOffset, formatTimeIn } from '@/utils/flight-utils';

/*
 * The takeoff and landing glyphs are the design's own assets (Material "flight_takeoff"
 * and "flight_land"), served from /public rather than redrawn. The takeoff file carries
 * its full 24px frame; the landing file is the bare glyph, so it is set at its offset
 * inside a 24px box to sit on the same grid as the takeoff icon.
 */

export function TakeoffIcon() {
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/icons/flights/flight-takeoff.svg" alt="" aria-hidden="true" width={24} height={24} className="size-4 shrink-0 sm:size-5 lg:size-6" />
    );
}

export function LandIcon() {
    return (
        <span aria-hidden="true" className="relative size-4 shrink-0 sm:size-5 lg:size-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src="/icons/flights/flight-land.svg"
                alt=""
                width={17}
                height={19.2193}
                className="absolute left-[14.6%] top-[5.3%] h-[80%] w-[70.8%]"
            />
        </span>
    );
}

/** "Hamad International Airport (DOH)", or the bare code for an airport we do not carry. */
export function airportLabel(code: string, name?: string): string {
    const full = name ?? getAirportByCode(code)?.name;
    return full && full !== code ? `${full} (${code})` : code;
}

/**
 * One end of a flight as the design draws it: the clock large, the plane glyph between it
 * and the rule, the airport named in full beneath.
 *
 * An arrival that lands on a later day carries "+ 1" beside its clock, in the clock's own
 * size — the row has no date on it, so without the offset an overnight flight reads as
 * landing before it leaves. The offset is its own element so the clock alone stays
 * findable as text.
 */
export function EndClock({
    time,
    departedAt,
    end,
    glyph = true,
}: {
    time: string;
    /** For an arrival: when the journey it ends set off, to work out the day offset. */
    departedAt?: string;
    end: 'departure' | 'arrival';
    /** The takeoff / landing glyph beside the clock. The flight-by-flight itinerary leaves it off. */
    glyph?: boolean;
}) {
    const locale = useLocale();
    const days = end === 'arrival' ? dayOffset(departedAt, time) : 0;

    return (
        <span className={`inline-flex items-center gap-1.5 ${end === 'arrival' ? 'flex-row-reverse' : ''}`}>
            <span className="whitespace-nowrap text-base leading-tight text-slate-900 dark:text-white sm:text-lg lg:text-2xl">
                <span>{formatTimeIn(time, locale)}</span>
                {days > 0 && <span>{` + ${days}`}</span>}
            </span>
            {glyph && (end === 'departure' ? <TakeoffIcon /> : <LandIcon />)}
        </span>
    );
}
