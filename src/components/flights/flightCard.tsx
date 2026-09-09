"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Luggage, ShoppingBag, ChevronDown, ChevronUp, Shield, XCircle, BadgeDollarSign, Users } from 'lucide-react';
import type { FlightOffer } from '@/types/flights';
import { formatPrice, formatPriceWithCents, formatDuration, formatTimeIn, formatDurationLong } from '@/utils/flight-utils';
import { ArrivalDayOffset } from './ArrivalDayOffset';
import { offerSlices } from '@/lib/flights/offer-slices';
import { getAirportByCode } from '@/lib/airports';
import { FlightItineraryDetails } from '@/components/flights/FlightItineraryDetails';
import SaveButton from '@/components/common/SaveButton';
import { useTranslations, useLocale } from 'next-intl';

import { useUserCurrency } from '@/stores/searchStore';

type Translator = ReturnType<typeof useTranslations>;

// ─── Helpers ─────────────────────────────────────────────────────────

function providerLabel(provider: string): string {
    if (provider === 'mystifly_v2' || provider === 'mystifly') return 'Mystifly';
    if (provider === 'duffel') return 'Duffel';
    return provider;
}

function airportLabel(code: string | undefined): string {
    if (!code) return '';
    const name = getAirportByCode(code)?.name;
    return name ? `${name} (${code})` : code;
}

/**
 * "Economy", "Premium Economy" — title-cased in the text itself rather than by a
 * `capitalize` class, so the badge reads correctly wherever the string is used.
 */
function cabinLabel(cabinClass: string | undefined): string {
    return (cabinClass || 'economy').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function stopsLabel(stops: number, t: Translator): string {
    if (stops === 0) return t('nonstop');
    if (stops === 1) return t('stopCount', { count: stops });
    return t('stopsCount', { count: stops });
}


// ─── Airline Logo ────────────────────────────────────────────────────

function AirlineLogo({ code, name }: { code: string | undefined; name?: string }) {
    const [failed, setFailed] = useState(false);
    const iata = (code || '').toUpperCase().slice(0, 3);
    const initials = iata.slice(0, 2) || (name || '??').slice(0, 2).toUpperCase();

    if (iata && !failed) {
        return (
            <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-white border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={`https://pics.avs.io/40/40/${iata}.png`}
                    alt={name || iata}
                    className="w-4 h-4 lg:w-6 lg:h-6 object-contain"
                    onError={() => setFailed(true)}
                />
            </div>
        );
    }

    return (
        <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-slate-600 flex items-center justify-center text-white font-bold text-[9px] lg:text-xs shrink-0">
            {initials}
        </div>
    );
}

// ─── FlightCard Props ────────────────────────────────────────────────

export interface FlightCardProps {
    offer: FlightOffer;
    index?: number;
    onSelect?: (offer: FlightOffer) => void;
    isSelected?: boolean;
}

// ─── FlightCard ──────────────────────────────────────────────────────

export const FlightCard: React.FC<FlightCardProps> = ({ offer, index = 0, onSelect, isSelected = false }) => {
    const [expanded, setExpanded] = useState(false);
    const targetCurrency = useUserCurrency();
    const t = useTranslations('flights.card');
    // Times are rendered per locale — 12-hour where the locale says so, 24-hour where it
    // does not — without ever converting the wall clock. See formatTimeIn.
    const locale = useLocale();

    // The slices the traveller actually flies. The book page reads the same function, so
    // the two screens cannot disagree about a journey again — they did, and a round trip
    // that stopped once each way was "1 stop" here and "2 stops" at checkout.
    const slices = offerSlices(offer);

    // Collapsed card view: always show the outbound leg only.
    // Using the last segment overall would show the return arrival airport/time for round-trips.
    const primary = offer.segments[0];
    const outbound = slices[0];
    const outboundLeg = outbound?.segments ?? offer.segments;
    const outboundLast = outboundLeg[outboundLeg.length - 1];
    // Everything below describes the OUTBOUND SLICE and nothing else. Mixing an
    // offer-wide figure in here is what made a 2-segment outbound advertise "+ 3 more".
    const outboundStops = outbound?.stops ?? 0;
    const outboundDurationMins = outbound?.durationMinutes;
    // Every flight number in this slice — the traveller boards each one of them.
    const outboundFlightNumbers = outboundLeg.map(s => s.flightNumber).filter(Boolean).join(', ');
    // The design names airports in full. A code we do not carry is shown as itself —
    // the three letters on the boarding pass beat an invented name.
    const departureAirport = airportLabel(primary.departure.airport);
    const arrivalAirport = airportLabel(outboundLast?.arrival?.airport);
    // Who actually flies, when that is not who sold the seat.
    const operators = Array.from(
        new Set(outboundLeg.map(s => s.operatingAirline?.name).filter(Boolean))
    ) as string[];
    const partiallyOperated = operators.length > 0 && outboundLeg.some(s => !s.operatingAirline);

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03, duration: 0.25 }}
            className={`
                group relative bg-white dark:bg-slate-900 w-full
                rounded-2xl overflow-hidden border transition-all duration-200
                ${isSelected
                    ? 'border-blue-500 ring-2 ring-blue-500/15 shadow-[0_16px_40px_-16px_rgba(15,23,42,0.20)]'
                    : 'border-slate-200/70 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 shadow-[0_10px_30px_-14px_rgba(15,23,42,0.14)] hover:shadow-[0_16px_40px_-16px_rgba(15,23,42,0.18)]'
                }
            `}
        >
            {/* ─── Save/Heart Button (mobile only — top-right corner) ─── */}
            <div className="absolute top-2 right-2 z-10 lg:hidden">
                <SaveButton
                    type="flight"
                    title={`${primary.departure.airport} → ${outboundLast?.arrival?.airport} · ${primary.departure.time?.slice(0, 10) ?? ''}`}
                    subtitle={`${primary.airline.name} · ${formatDurationLong(outboundDurationMins)} · ${stopsLabel(outboundStops, t)}`}
                    price={offer.price.total}
                    currency={offer.price.currency}
                    imageUrl={`https://pics.avs.io/40/40/${(primary.airline.code || '').toUpperCase()}.png`}
                    deepLink={`/flights/search?origin=${primary.departure.airport}&destination=${outboundLast?.arrival?.airport}&departure=${primary.departure.time?.slice(0, 10) ?? ''}`}
                    snapshot={{ offerId: offer.offerId, provider: offer.provider }}
                    size="sm"
                />
            </div>

            <div className="flex flex-col lg:flex-row">
                {/* ─── Flight Info + Expand (left) ─── */}
                <div className="flex-1 min-w-0">
                  <div className="p-4 lg:p-6">
                    {/* ─── Airline, its flight numbers, and the fare's badges ─── */}
                    <div className="flex flex-wrap items-start gap-x-3 gap-y-2 mb-3 lg:mb-4">
                        <div className="flex items-center gap-2 shrink-0">
                            <AirlineLogo code={primary.airline.code} name={primary.airline.name} />
                            <div className="min-w-0">
                                <div className="font-semibold text-blue-600 dark:text-blue-400 text-[12px] lg:text-[14px] leading-tight">
                                    {primary.airline.name}
                                </div>
                                <div className="text-[10px] lg:text-[12px] text-slate-400 dark:text-slate-500">
                                    {outboundFlightNumbers}
                                </div>
                                {operators.length > 0 && (
                                    <div className="text-[9px] lg:text-[11px] text-amber-700 dark:text-amber-500 truncate">
                                        {partiallyOperated
                                            ? t('partiallyOperatedBy', { airline: operators.join(', ') })
                                            : t('operatedBy', { airline: operators.join(', ') })}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Tags */}
                    <div className="flex flex-wrap items-center gap-1 lg:gap-1.5 min-w-0">
                        {/* ─── Baggage allowance ───
                            Rendered only when the airline actually stated an allowance.
                            A count of 0 is a fact ("no free bag") and is shown muted;
                            an absent count means unknown and shows nothing at all. */}
                        {offer.baggage?.carryOnBags != null && (
                            <span className="inline-flex items-center gap-1 px-2 lg:px-2.5 py-0.5 lg:py-1 rounded-full text-[9px] lg:text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                <ShoppingBag className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
                                {t('carryOnBags', { count: offer.baggage.carryOnBags })}
                            </span>
                        )}
                        {offer.baggage?.checkedBags != null && (
                            <span className="inline-flex items-center gap-1 px-2 lg:px-2.5 py-0.5 lg:py-1 rounded-full text-[9px] lg:text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                <Luggage className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
                                {t('checkedBags', { count: offer.baggage.checkedBags })}
                            </span>
                        )}
                        {/* ─── Tristate refundability badge (always visible) ─── */}
                        {(() => {
                            const fp = offer.farePolicy;
                            // Use farePolicy if available, fall back to legacy refundable bool
                            const isRefundable = fp ? fp.isRefundable : offer.refundable;
                            const penalty = fp?.refundPenaltyAmount;

                            if (isRefundable && penalty === 0) {
                                // 🟢 Free cancellation
                                return (
                                    <span className="inline-flex items-center gap-1 px-2 lg:px-2.5 py-0.5 lg:py-1 rounded-full text-[9px] lg:text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                        <Shield className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
                                        {t('freeCancellation')}
                                    </span>
                                );
                            } else if (isRefundable) {
                                // 🟡 Refundable with fee OR unknown penalty amount
                                const formattedFee = penalty != null && penalty > 0
                                    ? formatPrice(penalty, fp?.refundPenaltyCurrency ?? 'USD', targetCurrency)
                                    : '';
                                const feeLabel = penalty != null && penalty > 0
                                    ? t('refundableFee', { fee: formattedFee })
                                    : t('refundableFeesMayApply');
                                return (
                                    <span className="inline-flex items-center gap-1 px-2 lg:px-2.5 py-0.5 lg:py-1 rounded-full text-[9px] lg:text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                        <BadgeDollarSign className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
                                        {feeLabel}
                                    </span>
                                );
                            } else {
                                // 🔴 Non-refundable
                                return (
                                    <span className="inline-flex items-center gap-1 px-2 lg:px-2.5 py-0.5 lg:py-1 rounded-full text-[9px] lg:text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                        <XCircle className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
                                        {t('nonRefundable')}
                                    </span>
                                );
                            }
                        })()}
                        <span className="inline-flex items-center gap-1 px-2 lg:px-2.5 py-0.5 lg:py-1 rounded-full text-[9px] lg:text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {cabinLabel(primary.cabinClass)}
                        </span>
                        {offer.alternatives && offer.alternatives.length > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 lg:px-2.5 py-0.5 lg:py-1 rounded-full text-[9px] lg:text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                <BadgeDollarSign className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
                                {t('brandsAvailable', { count: offer.alternatives.length + 1 })}
                            </span>
                        )}
                        
                        {offer.seatsRemaining != null && offer.seatsRemaining > 0 && (
                            <span className={`inline-flex items-center gap-0.5 px-1 lg:px-2 py-px lg:py-0.5 rounded-full text-[9px] lg:text-xs font-normal border ${offer.seatsRemaining <= 3
                                    ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
                                    : offer.seatsRemaining <= 6
                                        ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
                                        : 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                                }`}>
                                <Users className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
                                {offer.seatsRemaining <= 3
                                    ? t('onlySeatsLeft', { count: offer.seatsRemaining })
                                    : offer.seatsRemaining <= 6
                                        ? t('seatsLeft', { count: offer.seatsRemaining })
                                        : t('seatsAvailable', { count: offer.seatsRemaining })}
                            </span>
                        )}
                    </div>
                    </div>

                    {/* ─── Route summary — the OUTBOUND leg only ───
                        The offer's totals sum both directions of a round trip and so
                        describe a journey nobody takes. Everything here is that leg's. */}
                    <div className="flex items-start justify-between gap-1 lg:gap-3">
                        <div className="flex w-[34%] shrink-0 flex-col gap-0.5 sm:w-[26%]">
                            <span className="text-lg lg:text-2xl font-semibold leading-tight text-slate-900 dark:text-white">
                                {formatTimeIn(primary.departure.time, locale)}
                            </span>
                            <span className="text-[9px] lg:text-[11px] text-slate-400 dark:text-slate-500">
                                {t('departing')}
                            </span>
                            <span className="text-[11px] lg:text-[13px] leading-snug text-slate-800 dark:text-slate-200">
                                {departureAirport}
                            </span>
                            {/* The gate this leg leaves from, when the airline named it.
                                A connecting itinerary spells out every terminal once
                                expanded — this is the journey's start only. */}
                            {primary.departure.terminal && (
                                <span className="text-[10px] lg:text-[12px] leading-snug text-slate-400 dark:text-slate-500">
                                    {t('terminal', { terminal: primary.departure.terminal })}
                                </span>
                            )}
                        </div>

                        <div className="flex min-w-0 flex-1 flex-col items-center gap-1 px-1 pt-1.5 lg:px-2">
                            <span className="text-center text-[10px] lg:text-[12px] text-slate-400 dark:text-slate-500">
                                {t('totalFlightDuration')}
                                <span className="ml-1 font-semibold text-slate-900 dark:text-white">
                                    {formatDurationLong(outboundDurationMins)}
                                </span>
                            </span>
                            <div className="w-full border-t border-dotted border-blue-300 dark:border-blue-800/60" />
                            <span className="text-center text-[10px] lg:text-[12px] text-slate-400 dark:text-slate-500">
                                {t('stopsLabel')}
                                {/* The value carries the colour, the label stays muted —
                                    the stop count is what the eye is scanning the row for. */}
                                <span className="ml-1 font-semibold text-orange-600 dark:text-orange-400">
                                    {t('stopCountTitle', { count: outboundStops })}
                                </span>
                            </span>
                        </div>

                        <div className="flex w-[34%] shrink-0 flex-col items-end gap-0.5 text-right sm:w-[26%]">
                            <span className="text-lg lg:text-2xl font-semibold leading-tight text-slate-900 dark:text-white">
                                {formatTimeIn(outboundLast?.arrival?.time, locale)}
                                <ArrivalDayOffset
                                    from={primary.departure.time}
                                    to={outboundLast?.arrival?.time}
                                />
                            </span>
                            <span className="text-[9px] lg:text-[11px] text-slate-400 dark:text-slate-500">
                                {t('arrivingAt')}
                            </span>
                            <span className="text-[11px] lg:text-[13px] leading-snug text-slate-700 dark:text-slate-200">
                                {arrivalAirport}
                            </span>
                            {/* The terminal this leg reaches — the outbound's final
                                arrival, matching the airport named just above. */}
                            {outboundLast?.arrival?.terminal && (
                                <span className="text-[10px] lg:text-[12px] leading-snug text-slate-400 dark:text-slate-500">
                                    {t('terminal', { terminal: outboundLast.arrival.terminal })}
                                </span>
                            )}
                        </div>
                    </div>
                  </div>

                  {/* ─── Expand Toggle ─── */}
                  {offer.segments.length > 1 && (
                      <button
                          onClick={() => setExpanded(!expanded)}
                          className="flex items-center gap-1 px-4 lg:px-6 pb-4 lg:pb-6 text-[10px] lg:text-xs text-slate-800 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white transition-colors"
                      >
                          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          {expanded ? t('hideDetails') : (offer.alternatives && offer.alternatives.length > 0 ? t('compareOptions', { count: offer.alternatives.length + 1 }) : t('showAllSegments'))}
                      </button>
                  )}

                  {/* ─── Expanded View (Details + Alternatives) ─── */}
                  <AnimatePresence>
                      {expanded && (
                          <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
                              className="border-t border-slate-100 dark:border-slate-800 overflow-hidden"
                          >
                          {/* The height animation above opens the space; this slides the
                              itinerary down into it, so the legs read as arriving rather
                              than as the card stretching. Clipped by the parent's
                              overflow-hidden, so it travels in from under the rule.
                              Carries no layout of its own — the padding stays on the
                              sections inside it. */}
                          <motion.div
                              initial={{ y: -12 }}
                              animate={{ y: 0 }}
                              exit={{ y: -12 }}
                              transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
                          >
                          {/* Alternatives / Brands Section */}
                          {offer.alternatives && offer.alternatives.length > 0 && (
                              <div className="bg-slate-50/50 dark:bg-slate-800/20 px-4 lg:px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                                  <h4 className="text-[11px] font-normal text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                      <BadgeDollarSign className="w-3.5 h-3.5 text-blue-500" />
                                      {t('availableFareOptions')}
                                  </h4>
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                      {/* Current main offer as one of the options */}
                                      <div className="flex flex-col p-2.5 rounded-lg border-2 border-blue-500 bg-white dark:bg-slate-900 shadow-sm">
                                          <div className="flex justify-between items-start mb-1">
                                              <span className="text-[11px] font-normal text-blue-600 dark:text-blue-400 px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/30 rounded uppercase">
                                                  {offer.brandedFare?.brandName || offer.brandedFare?.fareType || t('standard')}
                                              </span>
                                              <span className="text-xs font-normal text-slate-900 dark:text-white">
                                                  {formatPrice(offer.price.total, offer.price.currency, targetCurrency)}
                                              </span>
                                          </div>
                                          <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2 italic mb-2">
                                               {(offer.segments[0].cabinClass || 'economy').replace('_', ' ')} · {t('bestValue')}
                                          </p>
                                          <button
                                              disabled
                                              className="mt-auto py-1 px-3 rounded bg-blue-600 text-white text-[10px] font-normal opacity-50 cursor-default"
                                          >
                                              {t('currentlySelected')}
                                          </button>
                                      </div>

                                      {/* Alternatives */}
                                      {offer.alternatives.map((alt) => (
                                          <div key={alt.offerId} className="flex flex-col p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-blue-300 transition-colors">
                                              <div className="flex justify-between items-start mb-1">
                                                  <span className="text-[11px] font-normal text-slate-600 dark:text-slate-300 px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded uppercase">
                                                      {alt.brandedFare?.brandName || alt.brandedFare?.fareType || t('option')}
                                                  </span>
                                                  <span className="text-xs font-normal text-slate-900 dark:text-white">
                                                      {formatPrice(alt.price.total, alt.price.currency, targetCurrency)}
                                                  </span>
                                              </div>
                                              <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2 italic mb-2">
                                                  {(alt.segments[0].cabinClass || 'economy').replace('_', ' ')}{process.env.NODE_ENV !== 'production' ? ` · ${providerLabel(alt.provider)}` : ''}
                                              </p>
                                              <button
                                                  onClick={(e) => {
                                                      e.stopPropagation();
                                                      onSelect?.(alt);
                                                  }}
                                                  className="mt-auto py-1 px-3 rounded bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-700 dark:text-slate-300 text-[10px] font-normal transition-colors"
                                              >
                                                  {t('selectFare', { fare: alt.brandedFare?.brandName || alt.brandedFare?.fareType || t('thisFare') })}
                                              </button>
                                          </div>
                                      ))}
                                  </div>
                              </div>
                          )}

                          {/* Flight Detail Segments */}
                          <div className="px-4 lg:px-6 py-4 lg:py-6 space-y-0.5 lg:space-y-1">
                              <FlightItineraryDetails offer={offer} />
                          </div>
                          </motion.div>
                          </motion.div>
                      )}
                  </AnimatePresence>
                </div>

                {/* ─── Price + CTA (right) ─── */}
                <div className="relative flex flex-row lg:flex-col items-center lg:items-center justify-between lg:justify-between gap-1 lg:gap-1.5 lg:w-[180px] p-4 lg:p-6 lg:border-l border-t lg:border-t-0 border-slate-100 dark:border-slate-800">
                    {/* Heart button — desktop only, inline */}
                    <div className="hidden lg:flex justify-end w-full mb-1 relative z-10">
                        <SaveButton
                            type="flight"
                            title={`${primary.departure.airport} → ${outboundLast?.arrival?.airport} · ${primary.departure.time?.slice(0, 10) ?? ''}`}
                            subtitle={`${primary.airline.name} · ${formatDuration(offer.totalDuration)} · ${stopsLabel(offer.totalStops, t)}`}
                            price={offer.price.total}
                            currency={offer.price.currency}
                            imageUrl={`https://pics.avs.io/40/40/${(primary.airline.code || '').toUpperCase()}.png`}
                            deepLink={`/flights/search?origin=${primary.departure.airport}&destination=${outboundLast?.arrival?.airport}&departure=${primary.departure.time?.slice(0, 10) ?? ''}`}
                            snapshot={{ offerId: offer.offerId, provider: offer.provider }}
                            size="sm"
                        />
                    </div>

                    {/* The design states the fare to the cent. formatPrice rounds every
                        other price in the app, hotels included, and stays as it is. */}
                    <div className="lg:text-center">
                        <span className="text-base lg:text-2xl font-semibold text-slate-900 dark:text-white leading-tight">
                            {formatPriceWithCents(offer.price.pricePerAdult, offer.price.currency, targetCurrency)}
                        </span>
                        <span className="ml-1 text-[9px] lg:text-xs text-slate-400 dark:text-slate-500">
                            {t('feesIncluded')}
                        </span>
                    </div>

                    <div className="flex items-center gap-2 lg:mt-auto">
                        <button
                            onClick={() => onSelect?.(offer)}
                            className="px-5 lg:px-8 py-1.5 lg:py-2 rounded-full lg:rounded-md bg-blue-600 hover:bg-blue-700 text-white font-medium text-[11px] lg:text-sm transition-colors flex items-center justify-center gap-1 shrink-0"
                        >
                            {t('select')}
                            <ArrowRight className="w-3 h-3 lg:w-4 lg:h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default FlightCard;
