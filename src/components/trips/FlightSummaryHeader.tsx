'use client';

import React, { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Calendar, MoveRight, RotateCcw, XCircle } from 'lucide-react';
import { AirlineSeatReclineIcon } from '@/components/icons/AirlineSeatReclineIcon';
import type { FlightBookingRecord } from '@/services/booking.service';
import { bookingToFlightOffer, durationMinutes } from '@/lib/trips/booking-itinerary';
import { offerSlices } from '@/lib/flights/offer-slices';
import { segmentTerminal } from '@/lib/flights/terminal-fallback';
import { getAirportByCode } from '@/lib/airports';
import { formatBookingDate, formatBookingTime, formatDurationLong, getAirlineName } from '@/utils/flight-utils';

/**
 * What a traveller reads at a glance about a flight they have already paid for.
 *
 * Shared by the trips list card and a trip's own page. Those two had their own copies,
 * which had already drifted into different layouts and duplicate leg-grouping rules;
 * one of them showed a terminal the other did not.
 *
 * Times are rendered in the reader's own timezone, not the airport's. The stored values
 * are instants (`timestamp with time zone`), and nothing here carries an IANA zone per
 * airport to convert them back with — so a London arrival reads in the viewer's clock.
 * That is pre-existing across this app; fixing it means putting a timezone on Airport.
 */

export function FlightSummaryHeader({ booking }: { booking: FlightBookingRecord }) {
    const t = useTranslations('trips');

    const offer = useMemo(() => bookingToFlightOffer(booking), [booking]);
    const segments = booking.flight_segments ?? [];

    // The outbound leg only. A round trip's return is a different journey, and its
    // clocks belong to it, not to the headline the traveller reads first.
    const outbound = offer ? offerSlices(offer)[0] : undefined;
    const first = outbound?.segments[0];
    const last = outbound?.segments[outbound.segments.length - 1];

    if (!offer || !first || !last) return null;

    // Read through segmentTerminal so this names the same terminal the itinerary below
    // does — the airline's own when it gave one, the carrier's standing gate otherwise.
    const departureTerminal = segmentTerminal(first, 'departure');
    const arrivalTerminal = segmentTerminal(last, 'arrival');
    const departureAirport = getAirportByCode(first.origin);
    const arrivalAirport = getAirportByCode(last.destination);

    // Wheels-up to wheels-down across the whole outbound, connections included. Safe to
    // subtract: both sides are stored instants, not offset-less local times.
    const totalMinutes = durationMinutes(first.departure.time, last.arrival.time);

    const flightNumbers = Array.from(new Set(segments.map(s => s.flight_number))).join(', ');
    const passengerCount = booking.passengers?.length ?? 0;

    // undefined when the airline's rules were never recorded — distinct from false.
    const refundable: boolean | undefined =
        typeof booking.fare_policy?.isRefundable === 'boolean' ? booking.fare_policy.isRefundable : undefined;

    return (
        <div className="flex flex-col">
            {/* Airline, its flight numbers, and the booking's facts.
                The facts share the carrier's own line rather than hanging off the block
                beside it, so they start where its name does and the flight numbers keep
                the line below to themselves. */}
            <div className="flex items-center gap-2 mb-3">
                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={`https://images.kiwi.com/airlines/64/${first.airline.code}.png`}
                        alt={first.airline.name}
                        className="w-6 h-6 object-contain"
                    />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span className="text-[15px] font-bold text-blue-600 dark:text-blue-400 truncate min-w-0">
                            {getAirlineName(first.airline.code)}
                        </span>

                        {/* Every glyph here is the accent blue and every word beside it is
                            near-black: the design draws the icons as the coloured element
                            and lets the facts themselves read as plain text. */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-900 dark:text-slate-100">
                            <span className="flex items-center gap-1.5">
                                <span className="text-blue-600 dark:text-blue-400 font-semibold text-[10px] uppercase tracking-wide shrink-0">
                                    {t('flightBookingCard.pnr')}
                                </span>
                                <span>{booking.pnr}</span>
                            </span>
                            <span className="flex items-center gap-1">
                                <AirlineSeatReclineIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                                {/* One traveller is a passenger, not "1 passengers". */}
                                <span>
                                    {t(
                                        passengerCount === 1
                                            ? 'flightBookingCard.passenger'
                                            : 'flightBookingCard.passengers',
                                        { count: passengerCount },
                                    )}
                                </span>
                            </span>
                            {/* Stops are deliberately absent here. A round trip needs one
                                figure per direction, and two of them side by side read as
                                noise on a booking already paid for; a single combined figure
                                is the summary [ADR-0010] retired. The trip's own page carries
                                the itinerary, which states each direction in full. */}
                            {/* Read straight off the booking's stored fare policy, so this
                                works on the server-rendered trip page as well as in the list
                                card. Absent rules say nothing at all — claiming a ticket is
                                non-refundable when we simply do not know is the expensive
                                way to be wrong. */}
                            {refundable !== undefined && (
                                <span className="flex items-center gap-1">
                                    {refundable
                                        ? <RotateCcw className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                                        : <XCircle className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}
                                    <span>
                                        {refundable
                                            ? t('flightBookingCard.fareBadges.refundable')
                                            : t('flightBookingCard.fareBadges.nonRefundable')}
                                    </span>
                                </span>
                            )}
                        </div>
                    </div>

                    {flightNumbers && (
                        <span className="block text-[12px] text-slate-500 dark:text-slate-400 truncate">
                            {flightNumbers}
                        </span>
                    )}
                </div>
            </div>

            {/* Both ends dated in full, so a red-eye says which day it lands.
                Indented past the logo to sit under the airline's own name, where the
                design hangs it — the logo's width plus the gap beside it. */}
            <div className="ml-12 flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 text-[13px] text-[#939fb1] dark:text-slate-400">
                <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>{formatBookingDate(first.departure.time)}, {formatBookingTime(first.departure.time)}</span>
                <MoveRight aria-hidden="true" className="w-4 h-4 text-slate-900 dark:text-slate-300 shrink-0" />
                <span>{formatBookingDate(last.arrival.time)}, {formatBookingTime(last.arrival.time)}</span>
            </div>

            {/* The clocks, with the elapsed time on the rule between them.
                Each end is one centred stack — clock, label, airport, code all share an
                axis — so the columns below hang off their own time rather than being
                pushed out to the card's edges. */}
            <div className="flex items-center gap-3 mb-2">
                <span className="basis-[22%] shrink-0 text-center text-[24px] leading-tight text-slate-900 dark:text-white">
                    {formatBookingTime(first.departure.time)}
                </span>
                <div className="flex-1 min-w-0 flex flex-col items-center gap-1">
                    {totalMinutes > 0 && (
                        <span className="text-center text-xs font-bold text-[#939fb1] dark:text-slate-400">
                            {t('flightBookingCard.totalFlightDuration')}{' '}
                            <span className="font-normal text-slate-900 dark:text-white">
                                {formatDurationLong(totalMinutes)}
                            </span>
                        </span>
                    )}
                    <div className="w-full border-t border-dotted border-blue-600 dark:border-blue-500/70" />
                </div>
                <span className="basis-[22%] shrink-0 text-center text-[24px] leading-tight text-slate-900 dark:text-white">
                    {formatBookingTime(last.arrival.time)}
                </span>
            </div>

            {/* Where each end actually is. The code and terminal lead: it is what the
                traveller reads off the card on the way to the airport. */}
            <div className="flex items-start gap-3 text-[clamp(0.625rem,1.5vw,0.75rem)]">
                <div className="basis-[22%] shrink-0 min-w-0 text-center">
                    <span className="block text-[12px] font-bold uppercase text-[#939fb1] dark:text-slate-400">
                        {t('flightBookingCard.departFrom')}
                    </span>
                    <span className="block text-[13px] text-slate-900 dark:text-slate-200">
                        {departureAirport?.name ?? first.origin}
                    </span>
                    <span className="block text-[24px] font-bold leading-tight text-slate-900 dark:text-white">
                        {first.origin}{departureTerminal ? ` T${departureTerminal}` : ''}
                    </span>
                </div>
                <div className="flex-1" />
                <div className="basis-[22%] shrink-0 min-w-0 text-center">
                    <span className="block text-[12px] font-bold uppercase text-[#939fb1] dark:text-slate-400">
                        {t('flightBookingCard.arriveAt')}
                    </span>
                    <span className="block text-[13px] text-slate-900 dark:text-slate-200">
                        {arrivalAirport?.name ?? last.destination}
                    </span>
                    <span className="block text-[24px] font-bold leading-tight text-slate-900 dark:text-white">
                        {last.destination}{arrivalTerminal ? ` T${arrivalTerminal}` : ''}
                    </span>
                </div>
            </div>
        </div>
    );
}

export default FlightSummaryHeader;
