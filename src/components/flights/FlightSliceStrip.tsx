'use client';

import React from 'react';
import { Plane } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import type { OfferSlice } from '@/lib/flights/offer-slices';
import { formatDuration, formatTimeIn } from '@/utils/flight-utils';
import { ArrivalDayOffset } from './ArrivalDayOffset';

/**
 * One slice of a journey, rendered in its own terms: where it leaves, where it lands,
 * how long it runs, where it stops on the way.
 *
 * Nothing here reads an offer-wide figure. `totalStops` and `totalDuration` sum every
 * slice, so on a round trip they describe a journey nobody takes — that is what made the
 * book page advertise "2 stop(s)" on the same flight the search card called "1 stop",
 * and made an outbound to JFK claim it arrived at SFO.
 */
export function FlightSliceStrip({ slice }: { slice: OfferSlice }) {
    const t = useTranslations('flightBook');
    const locale = useLocale();

    const stopsText =
        slice.stops === 0
            ? t('orderSummary.nonstop')
            : t('orderSummary.stops', { count: slice.stops });

    return (
        <div className="flex items-center gap-2 lg:gap-4">
            <div className="text-center">
                <div className="text-[11px] lg:text-base font-normal text-slate-900 dark:text-white">
                    {formatTimeIn(slice.departure.time, locale)}
                </div>
                <div className="text-[9px] lg:text-[11px] text-slate-500 dark:text-slate-400">
                    {slice.departure.airport}
                </div>
            </div>

            <div className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
                {slice.durationMinutes != null && (
                    <span className="text-[9px] lg:text-[11px] text-slate-400">
                        {formatDuration(slice.durationMinutes)}
                    </span>
                )}
                <div className="w-full h-px bg-slate-200 dark:bg-slate-700 relative">
                    <Plane className="w-3 h-3 text-indigo-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-90" />
                </div>
                <span
                    className={`text-[9px] lg:text-[11px] font-normal ${
                        slice.stops === 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-amber-600 dark:text-amber-400'
                    }`}
                >
                    {stopsText}
                    {slice.layovers.length > 0 && (
                        <span className="text-slate-400 dark:text-slate-500">
                            {' · '}
                            {slice.layovers
                                .map(l => (l.minutes > 0 ? `${formatDuration(l.minutes)} ${l.airport}` : l.airport))
                                .join(' · ')}
                        </span>
                    )}
                </span>
            </div>

            <div className="text-center">
                <div className="text-[11px] lg:text-base font-normal text-slate-900 dark:text-white">
                    {formatTimeIn(slice.arrival.time, locale)}
                    <ArrivalDayOffset from={slice.departure.time} to={slice.arrival.time} />
                </div>
                <div className="text-[9px] lg:text-[11px] text-slate-500 dark:text-slate-400">
                    {slice.arrival.airport}
                </div>
            </div>
        </div>
    );
}
