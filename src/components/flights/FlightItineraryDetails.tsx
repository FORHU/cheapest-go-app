'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import type { FlightOffer } from '@/types/flights';
import { offerSlices } from '@/lib/flights/offer-slices';
import { sliceTimeline } from '@/lib/flights/itinerary-timeline';
import { FlightItineraryTimeline, LayoverNote } from './FlightItineraryTimeline';

/**
 * Every leg of an offer, each drawn in full.
 *
 * The search card shows this when a row is expanded; the book page shows it beneath the
 * summary strips. One component, so a traveller comparing the two screens is reading the
 * same description of the same journey.
 *
 * A round trip's legs are named for their direction, a multi-city trip's are numbered,
 * and a single leg is left unnamed — "Outbound" only means something beside a return.
 */
export function FlightItineraryDetails({ offer }: { offer: FlightOffer }) {
    const t = useTranslations('flights.itinerary');
    const slices = offerSlices(offer);
    const twoWay = slices.length === 2;
    const multiLeg = slices.length > 1;

    // Where the layover goes depends on how many legs there are. A single leg carries it
    // between its own two flights, as the design draws it. A journey with a return sets
    // it at the seam instead — one break, between the outbound and the way home — so the
    // legs read as two halves of a trip rather than each keeping its own connections.
    const seamLayovers = multiLeg
        ? sliceTimeline(slices[0]).flatMap(leg => (leg.layover ? [leg.layover] : []))
        : [];

    return (
        <div className="flex flex-col gap-4">
            {slices.map((slice, i) => (
                <React.Fragment key={slice.sliceIndex}>
                    <div className="flex flex-col gap-2">
                        {multiLeg && (
                            <div className="text-[10px] lg:text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                {twoWay
                                    ? (i === 0 ? t('outbound') : t('return'))
                                    : t('legLabel', { number: i + 1 })}
                            </div>
                        )}
                        <FlightItineraryTimeline slice={slice} showLayovers={!multiLeg} />
                    </div>

                    {i === 0 &&
                        seamLayovers.map((layover, j) => (
                            <LayoverNote key={`seam-${j}`} layover={layover} />
                        ))}
                </React.Fragment>
            ))}
        </div>
    );
}
