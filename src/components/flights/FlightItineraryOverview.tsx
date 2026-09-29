'use client';

import React from 'react';
import { useTranslations, useLocale } from 'next-intl';
import type { FlightOffer } from '@/types/flights';
import { offerSlices, type OfferSlice } from '@/lib/flights/offer-slices';
import { formatDateTimeIn, formatDurationLong } from '@/utils/flight-utils';
import { EndClock, airportLabel } from './FlightEndpoint';

/**
 * The head of the book page's itinerary card: one row per direction, each run end to end —
 * the departure clock and airport, the direction's own total over a dotted rule with its
 * stops beneath, and the arrival clock and airport.
 *
 * Like FlightItinerarySummary, every figure is the slice's own. A round trip's outbound
 * and return are two journeys; neither row answers for the other's stops or duration.
 */
export function FlightItineraryOverview({ offer }: { offer: FlightOffer }) {
    const t = useTranslations('flights.itinerary');
    const slices = offerSlices(offer);
    const twoWay = slices.length === 2;
    const multiLeg = slices.length > 1;

    return (
        <div className="flex flex-col gap-5 lg:gap-7">
            {slices.map((slice, i) => (
                <SliceRow
                    key={slice.sliceIndex}
                    slice={slice}
                    label={
                        multiLeg
                            ? twoWay
                                ? (i === 0 ? t('outbound') : t('return'))
                                : t('legLabel', { number: i + 1 })
                            : undefined
                    }
                />
            ))}
        </div>
    );
}

function SliceRow({ slice, label }: { slice: OfferSlice; label?: string }) {
    const t = useTranslations('flights.itinerary');
    const locale = useLocale();
    const duration = formatDurationLong(slice.durationMinutes);

    return (
        <div className="flex flex-col gap-1.5">
            {label && (
                <div className="flex flex-wrap items-baseline gap-x-2.5 text-[10px] text-slate-900 dark:text-slate-200 lg:text-[12px]">
                    <span className="uppercase">{label}</span>
                    <span>{formatDateTimeIn(slice.departure.time, locale)}</span>
                </div>
            )}

            <div className="flex items-start justify-between gap-2 lg:gap-3">
                <div className="flex w-[32%] shrink-0 flex-col items-start gap-0.5 text-left sm:w-[28%]">
                    <EndClock time={slice.departure.time} end="departure" />
                    <span className="text-[10px] leading-snug text-slate-900 dark:text-slate-200 lg:text-[12px]">
                        {airportLabel(slice.departure.airport)}
                    </span>
                </div>

                <div className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center text-[10px] leading-snug lg:text-[12px]">
                    {duration && (
                        <span className="text-slate-900 dark:text-white">
                            <span className="text-slate-600 dark:text-slate-400">{t('totalFlightDuration')}</span>{' '}
                            {duration}
                        </span>
                    )}
                    <div className="w-full border-t border-dotted border-blue-600 dark:border-blue-500/70" />
                    <span className="text-slate-900 dark:text-white">
                        <span className="text-slate-600 dark:text-slate-400">
                            {slice.stops === 0 ? t('nonstop') : t('stopCount', { count: slice.stops })}
                        </span>
                        {slice.layovers.map((layover, i) => (
                            <span key={i}>
                                {i > 0 ? ' · ' : ' '}
                                {layover.minutes > 0 && `${formatDurationLong(layover.minutes)} `}
                                {airportLabel(layover.airport)}
                            </span>
                        ))}
                    </span>
                </div>

                <div className="flex w-[32%] shrink-0 flex-col items-end gap-0.5 text-right sm:w-[28%]">
                    <EndClock time={slice.arrival.time} departedAt={slice.departure.time} end="arrival" />
                    <span className="text-[10px] leading-snug text-slate-900 dark:text-slate-200 lg:text-[12px]">
                        {airportLabel(slice.arrival.airport)}
                    </span>
                </div>
            </div>
        </div>
    );
}
