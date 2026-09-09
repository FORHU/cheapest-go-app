'use client';

import React from 'react';
import { useTranslations, useLocale } from 'next-intl';
import type { FlightOffer } from '@/types/flights';
import { offerSlices } from '@/lib/flights/offer-slices';
import { FlightSliceStrip } from './FlightSliceStrip';
import { formatDateIn } from '@/utils/flight-utils';

/**
 * Every slice of an offer, each described in its own terms.
 *
 * A round trip is two journeys, so it gets two strips: the traveller can see the return
 * they are about to pay for, and neither strip has to answer for the other's stops. A
 * single-slice journey is labelled nothing at all — calling it "Outbound" only makes
 * sense next to a return.
 */
export function FlightItinerarySummary({ offer }: { offer: FlightOffer }) {
    const t = useTranslations('flightBook');
    const locale = useLocale();
    const slices = offerSlices(offer);
    const labelled = slices.length > 1;

    return (
        <div className="flex flex-col gap-3">
            {slices.map(slice => (
                <div key={slice.sliceIndex} className="flex flex-col gap-1">
                    {labelled && (
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-[9px] lg:text-[11px] font-normal uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                {slice.sliceIndex === 0 ? t('itinerary.outbound') : t('itinerary.return')}
                            </span>
                            <span className="text-[9px] lg:text-[11px] text-slate-400 dark:text-slate-500">
                                {formatDateIn(slice.departure.time, locale)}
                            </span>
                        </div>
                    )}
                    <FlightSliceStrip slice={slice} />
                </div>
            ))}
        </div>
    );
}
