"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plane, ArrowRight, Luggage, ChevronDown, ChevronUp, Shield, XCircle, BadgeDollarSign, Users, Moon, Clock } from 'lucide-react';
import type { FlightOffer, FlightSegmentDetail } from '@/types/flights';
import { formatPrice, groupSegmentsIntoLegs, refundabilityOf, layoverMinutes, LONG_LAYOVER_MINUTES, type FlightLeg } from '@/utils/flight-utils';
import SaveButton from '@/components/common/SaveButton';
import { useTranslations } from 'next-intl';

import { useUserCurrency } from '@/stores/searchStore';

type Translator = ReturnType<typeof useTranslations>;

// ─── Helpers ─────────────────────────────────────────────────────────

function formatTime(iso: string | undefined): string {
    if (!iso) return '--:--';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '--:--';
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function providerLabel(provider: string): string {
    if (provider === 'mystifly_v2' || provider === 'mystifly') return 'Mystifly';
    if (provider === 'duffel') return 'Duffel';
    return provider;
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
            <div className="w-6 h-6 lg:w-8 lg:h-8 rounded-md bg-white border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 overflow-hidden">
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
        <div className="w-6 h-6 lg:w-8 lg:h-8 rounded-md bg-slate-600 flex items-center justify-center text-white font-bold text-[9px] lg:text-xs shrink-0">
            {initials}
        </div>
    );
}

// ─── Segment Detail Row ──────────────────────────────────────────────

function SegmentRow({ segment, t }: { segment: FlightSegmentDetail; t: Translator }) {
    return (
        <div className="flex items-center gap-2 lg:gap-4 py-1.5 lg:py-2.5 px-1">
            <AirlineLogo code={segment.airline.code} name={segment.airline.name} />

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 lg:gap-2 text-[9px] lg:text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium truncate">{segment.airline.name}</span>
                    <span className="text-slate-300 dark:text-slate-600">·</span>
                    <span>{segment.flightNumber}</span>
                    {segment.aircraft && (
                        <>
                            <span className="text-slate-300 dark:text-slate-600 hidden sm:inline">·</span>
                            <span className="hidden sm:inline">{segment.aircraft}</span>
                        </>
                    )}
                </div>

                <div className="flex items-center gap-1.5 lg:gap-3 mt-0.5 lg:mt-1.5">
                    <div className="text-center min-w-[40px] lg:min-w-[56px]">
                        <div className="text-xs lg:text-base font-semibold text-slate-900 dark:text-white">{formatTime(segment.departure.time)}</div>
                        <div className="text-[10px] lg:text-xs text-slate-500 dark:text-slate-400">{segment.departure.airport}</div>
                    </div>

                    <div className="flex-1 flex flex-col items-center gap-0 lg:gap-0.5 min-w-[60px] lg:min-w-[90px]">
                        <span className="text-[10px] lg:text-xs text-slate-400 dark:text-slate-500">{formatDuration(segment.duration)}</span>
                        <div className="w-full flex items-center gap-0.5">
                            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300 dark:via-slate-600 to-transparent" />
                            <Plane className="w-2 h-2 lg:w-3 lg:h-3 text-indigo-500 rotate-90 shrink-0" />
                            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300 dark:via-slate-600 to-transparent" />
                        </div>
                        <span className="text-[10px] lg:text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                            {segment.stops === 0 ? t('direct') : t('stopCountShort', { count: segment.stops })}
                        </span>
                    </div>

                    <div className="text-center min-w-[40px] lg:min-w-[56px]">
                        <div className="text-xs lg:text-base font-semibold text-slate-900 dark:text-white">{formatTime(segment.arrival.time)}</div>
                        <div className="text-[10px] lg:text-xs text-slate-500 dark:text-slate-400">{segment.arrival.airport}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Leg Summary Row ─────────────────────────────────────────────────

/**
 * One direction of the trip, collapsed to a single line.
 *
 * Duration and stop count are the leg's own — not the offer totals, which sum
 * outbound and return and so describe no journey anyone actually takes.
 */
function LegRow({ leg, t, showLabel, label }: { leg: FlightLeg; t: Translator; showLabel: boolean; label: string }) {
    const isLongLayover = leg.longestLayoverMinutes >= LONG_LAYOVER_MINUTES;

    return (
        <div className="flex items-center gap-1.5 lg:gap-3 min-w-0 w-full">
            {showLabel && (
                <span className="text-[8px] lg:text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-normal w-10 lg:w-14 shrink-0">
                    {label}
                </span>
            )}

            <div className="text-center">
                <div className="text-xs lg:text-base font-normal text-slate-900 dark:text-white leading-tight">{formatTime(leg.departureTime)}</div>
                <div className="text-[8px] lg:text-[10px] text-slate-500 dark:text-slate-400 font-normal">{leg.origin}</div>
            </div>

            <div className="flex-1 flex flex-col items-center gap-0 min-w-0">
                <span className="text-[10px] lg:text-xs text-slate-400 dark:text-slate-500 font-normal">{formatDuration(leg.durationMinutes)}</span>
                <div className="w-full flex items-center gap-0.5">
                    <div className="h-[1.5px] lg:h-[2px] flex-1 bg-gradient-to-r from-indigo-400 to-purple-400 rounded-full" />
                    <Plane className="w-2.5 h-2.5 lg:w-4 lg:h-4 text-indigo-500 rotate-90" />
                </div>
                <span className={`text-[10px] lg:text-xs font-normal ${leg.stops === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {stopsLabel(leg.stops, t)}
                </span>
            </div>

            <div className="text-center">
                <div className="text-xs lg:text-base font-normal text-slate-900 dark:text-white leading-tight">{formatTime(leg.arrivalTime)}</div>
                <div className="text-[8px] lg:text-[10px] text-slate-500 dark:text-slate-400 font-normal">{leg.destination}</div>
            </div>

            {/* A 25-hour connection sorts to the top on price with nothing to
                distinguish it from a 2-hour one. Say so on the collapsed card. */}
            {(isLongLayover || leg.hasOvernightLayover) && (
                <span
                    className="inline-flex items-center gap-0.5 px-1 lg:px-1.5 py-px rounded-full text-[8px] lg:text-[10px] bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 shrink-0"
                    title={t('longLayoverTitle', { duration: formatDuration(leg.longestLayoverMinutes) })}
                >
                    {leg.hasOvernightLayover
                        ? <Moon className="w-2 h-2 lg:w-2.5 lg:h-2.5" />
                        : <Clock className="w-2 h-2 lg:w-2.5 lg:h-2.5" />}
                    {formatDuration(leg.longestLayoverMinutes)}
                </span>
            )}
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

    // One entry per direction: [outbound] or [outbound, return].
    const legs = groupSegmentsIntoLegs(offer.segments);

    // Primary metrics for the collapsed card view
    const primary = offer.segments[0];
    const last = offer.segments[offer.segments.length - 1];

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03, duration: 0.25 }}
            className={`
                group relative bg-white dark:bg-slate-900 w-full 
                rounded-md overflow-hidden border transition-all duration-200
                ${isSelected
                    ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-lg'
                    : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-lg shadow-sm'
                }
            `}
        >
            {/* ─── Save/Heart Button (mobile only — top-right corner) ─── */}
            <div className="absolute top-2 right-2 z-10 lg:hidden">
                <SaveButton
                    type="flight"
                    title={`${primary.departure.airport} → ${last.arrival.airport} · ${primary.departure.time?.slice(0, 10) ?? ''}`}
                    subtitle={`${primary.airline.name} · ${formatDuration(offer.totalDuration)} · ${stopsLabel(offer.totalStops, t)}`}
                    price={offer.price.total}
                    currency={offer.price.currency}
                    imageUrl={`https://pics.avs.io/40/40/${(primary.airline.code || '').toUpperCase()}.png`}
                    deepLink={`/flights/search?origin=${primary.departure.airport}&destination=${last.arrival.airport}&departure=${primary.departure.time?.slice(0, 10) ?? ''}`}
                    snapshot={{ offerId: offer.offerId, provider: offer.provider }}
                    size="sm"
                />
            </div>

            <div className="flex flex-col lg:flex-row">
                {/* ─── Flight Info + Expand (left) ─── */}
                <div className="flex-1 min-w-0">
                  <div className="px-3 py-2 lg:px-4 lg:py-2.5">
                    {/* Airline header */}
                    <div className="flex items-center gap-1.5 lg:gap-2 mb-1 lg:mb-1.5">
                        <AirlineLogo code={primary.airline.code} name={primary.airline.name} />
                        <div className="min-w-0">
                            <div className="flex items-center gap-1 lg:gap-2">
                                <span className="font-normal text-blue-600 dark:text-blue-400 text-[10px] lg:text-xs">
                                    {primary.airline.name}
                                </span>
                            </div>
                            <div className="text-[10px] lg:text-xs text-slate-500 dark:text-slate-400">
                                {primary.flightNumber}
                                {offer.segments.length > 1 && ` ${t('moreSegments', { count: offer.segments.length - 1 })}`}
                            </div>
                        </div>
                    </div>

                    {/* Route timeline — one row per direction. A round trip is two
                        journeys and must never be collapsed into one: doing so read
                        as "CRK → CRK" with both durations summed. */}
                    <div className="flex flex-col gap-1 lg:gap-1.5 w-full">
                        {legs.map((leg, i) => (
                            <LegRow
                                key={leg.sliceIndex}
                                leg={leg}
                                t={t}
                                showLabel={legs.length > 1}
                                label={i === 0 ? t('outbound') : t('return')}
                            />
                        ))}
                    </div>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-0.5 lg:gap-1 mt-1 lg:mt-1.5 min-w-0 overflow-hidden">
                        {offer.baggage && (
                            <span className="inline-flex items-center gap-0.5 px-1 lg:px-2 py-px lg:py-0.5 rounded-full text-[8px] lg:text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                                <Luggage className="w-2 h-2 lg:w-3 lg:h-3" />
                                {Number(offer.baggage.checkedBags || 0) > 0
                                    ? t('bagsCount', { count: offer.baggage.checkedBags })
                                    : t('noBag')}
                            </span>
                        )}
                        {/* ─── Tristate refundability badge (always visible) ─── */}
                        {(() => {
                            const fp = offer.farePolicy;
                            const penalty = fp?.refundPenaltyAmount;
                            // A penalty at or above the fare is not refundability — see
                            // refundabilityOf(). This is what stopped a $499 ticket
                            // advertising itself as "Refundable (est. fee: $500)".
                            const refundability = refundabilityOf(fp, offer.refundable, offer.price.total);

                            if (refundability === 'free') {
                                // 🟢 Free cancellation
                                return (
                                    <span className="inline-flex items-center gap-0.5 px-1 lg:px-2 py-px lg:py-0.5 rounded-full text-[8px] lg:text-xs bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400">
                                        <Shield className="w-2 h-2 lg:w-3 lg:h-3" />
                                        {t('freeCancellation')}
                                    </span>
                                );
                            } else if (refundability === 'fee') {
                                // 🟡 Refundable with a fee below the fare, OR unknown penalty
                                const formattedFee = penalty != null && penalty > 0
                                    ? formatPrice(penalty, fp?.refundPenaltyCurrency ?? 'USD', targetCurrency)
                                    : '';
                                const feeLabel = penalty != null && penalty > 0
                                    ? t('refundableFee', { fee: formattedFee })
                                    : t('refundableFeesMayApply');
                                return (
                                    <span className="inline-flex items-center gap-0.5 px-1 lg:px-2 py-px lg:py-0.5 rounded-full text-[8px] lg:text-xs bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400">
                                        <BadgeDollarSign className="w-2 h-2 lg:w-3 lg:h-3" />
                                        {feeLabel}
                                    </span>
                                );
                            } else {
                                // 🔴 Non-refundable
                                return (
                                    <span className="inline-flex items-center gap-0.5 px-1 lg:px-2 py-px lg:py-0.5 rounded-full text-[8px] lg:text-xs bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400">
                                        <XCircle className="w-2 h-2 lg:w-3 lg:h-3" />
                                        {t('nonRefundable')}
                                    </span>
                                );
                            }
                        })()}
                        <span className="inline-flex items-center px-1 lg:px-2 py-px lg:py-0.5 rounded-full text-[8px] lg:text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 capitalize">
                            {(primary.cabinClass || 'economy').replace('_', ' ')}
                        </span>
                        <span className="inline-flex items-center px-1 lg:px-2 py-px lg:py-0.5 rounded-full text-[8px] lg:text-xs bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400">
                            {providerLabel(offer.provider)}
                        </span>
                        {offer.alternatives && offer.alternatives.length > 0 && (
                            <span className="inline-flex items-center gap-0.5 px-1 lg:px-2 py-px lg:py-0.5 rounded-full text-[9px] lg:text-xs bg-indigo-600 text-white font-normal animate-pulse shadow-sm shadow-indigo-500/50">
                                <BadgeDollarSign className="w-2 h-2 lg:w-3 lg:h-3" />
                                {t('brandsAvailable', { count: offer.alternatives.length + 1 })}
                            </span>
                        )}
                        {primary.aircraft && (
                            <span className="inline-flex items-center gap-0.5 px-1 lg:px-2 py-px lg:py-0.5 rounded-full text-[9px] lg:text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                                <Plane className="w-2 h-2 lg:w-3 lg:h-3" />
                                {primary.aircraft}
                            </span>
                        )}
                        {offer.seatsRemaining != null && offer.seatsRemaining > 0 && (
                            <span className={`inline-flex items-center gap-0.5 px-1 lg:px-2 py-px lg:py-0.5 rounded-full text-[9px] lg:text-xs font-normal border ${offer.seatsRemaining <= 3
                                    ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
                                    : offer.seatsRemaining <= 6
                                        ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
                                        : 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                                }`}>
                                <Users className="w-2 h-2 lg:w-3 lg:h-3" />
                                {offer.seatsRemaining <= 3
                                    ? t('onlySeatsLeft', { count: offer.seatsRemaining })
                                    : offer.seatsRemaining <= 6
                                        ? t('seatsLeft', { count: offer.seatsRemaining })
                                        : t('seatsAvailable', { count: offer.seatsRemaining })}
                            </span>
                        )}
                    </div>
                  </div>

                  {/* ─── Expand Toggle ─── */}
                  {offer.segments.length > 1 && (
                      <button
                          onClick={() => setExpanded(!expanded)}
                          className="flex items-center gap-0.5 px-3 lg:px-4 pb-1.5 text-[10px] lg:text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 transition-colors"
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
                          {/* Alternatives / Brands Section */}
                          {offer.alternatives && offer.alternatives.length > 0 && (
                              <div className="bg-slate-50/50 dark:bg-slate-800/20 px-2.5 lg:px-5 py-3 border-b border-slate-100 dark:border-slate-800">
                                  <h4 className="text-[11px] font-normal text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                      <BadgeDollarSign className="w-3.5 h-3.5 text-indigo-500" />
                                      {t('availableFareOptions')}
                                  </h4>
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                      {/* Current main offer as one of the options */}
                                      <div className="flex flex-col p-2.5 rounded-lg border-2 border-indigo-500 bg-white dark:bg-slate-900 shadow-sm">
                                          <div className="flex justify-between items-start mb-1">
                                              <span className="text-[11px] font-normal text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 rounded uppercase">
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
                                              className="mt-auto py-1 px-3 rounded bg-indigo-600 text-white text-[10px] font-normal opacity-50 cursor-default"
                                          >
                                              {t('currentlySelected')}
                                          </button>
                                      </div>

                                      {/* Alternatives */}
                                      {offer.alternatives.map((alt) => (
                                          <div key={alt.offerId} className="flex flex-col p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-indigo-300 transition-colors">
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
                                                  className="mt-auto py-1 px-3 rounded bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white text-slate-700 dark:text-slate-300 text-[10px] font-normal transition-colors"
                                              >
                                                  {t('selectFare', { fare: alt.brandedFare?.brandName || alt.brandedFare?.fareType || t('thisFare') })}
                                              </button>
                                          </div>
                                      ))}
                                  </div>
                              </div>
                          )}

                          {/* Flight Detail Segments */}
                          <div className="px-2.5 lg:px-5 pb-2 lg:pb-4 space-y-0.5 lg:space-y-1">
                              {legs.map((leg, routeIndex) => {
                                  const label = legs.length === 2
                                      ? (routeIndex === 0 ? t('outbound') : t('return'))
                                      : t('legLabel', { number: routeIndex + 1 });

                                  return (
                                      <div className="pt-3" key={leg.sliceIndex}>
                                          <div className="flex items-center gap-2 mb-1">
                                              <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                                  {label}
                                              </span>
                                              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                                  {formatDuration(leg.durationMinutes)} · {stopsLabel(leg.stops, t)}
                                              </span>
                                          </div>
                                          {leg.segments.map((seg, i) => (
                                              <React.Fragment key={`${leg.sliceIndex}-${i}`}>
                                                  <SegmentRow segment={seg} t={t} />
                                                  {/* Name the wait between flights — the segment rows
                                                      alone leave the traveller to subtract timestamps. */}
                                                  {i < leg.segments.length - 1 && (() => {
                                                      const gap = layoverMinutes(seg.arrival.time, leg.segments[i + 1].departure.time);
                                                      if (gap <= 0) return null;
                                                      const isLong = gap >= LONG_LAYOVER_MINUTES;
                                                      return (
                                                          <div className={`flex items-center gap-1.5 py-1 px-1 text-[10px] lg:text-xs ${isLong ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}`}>
                                                              <Clock className="w-2.5 h-2.5 lg:w-3 lg:h-3 shrink-0" />
                                                              {t('layoverIn', { duration: formatDuration(gap), airport: seg.arrival.airport })}
                                                          </div>
                                                      );
                                                  })()}
                                              </React.Fragment>
                                          ))}
                                      </div>
                                  );
                              })}
                          </div>
                          </motion.div>
                      )}
                  </AnimatePresence>
                </div>

                {/* ─── Price + CTA (right) ─── */}
                <div className="relative flex flex-row lg:flex-col items-center lg:items-end justify-between lg:justify-between gap-1 lg:gap-1.5 lg:w-[180px] px-3 py-1.5 lg:py-3 lg:px-4 lg:border-l border-t lg:border-t-0 border-slate-100 dark:border-slate-800">
                    {/* Heart button — desktop only, inline */}
                    <div className="hidden lg:flex justify-end w-full mb-1 relative z-10">
                        <SaveButton
                            type="flight"
                            title={`${primary.departure.airport} → ${last.arrival.airport} · ${primary.departure.time?.slice(0, 10) ?? ''}`}
                            subtitle={`${primary.airline.name} · ${formatDuration(offer.totalDuration)} · ${stopsLabel(offer.totalStops, t)}`}
                            price={offer.price.total}
                            currency={offer.price.currency}
                            imageUrl={`https://pics.avs.io/40/40/${(primary.airline.code || '').toUpperCase()}.png`}
                            deepLink={`/flights/search?origin=${primary.departure.airport}&destination=${last.arrival.airport}&departure=${primary.departure.time?.slice(0, 10) ?? ''}`}
                            snapshot={{ offerId: offer.offerId, provider: offer.provider }}
                            size="sm"
                        />
                    </div>

                    <div className="lg:text-right">
                        <div className="text-xs lg:text-lg font-normal text-slate-900 dark:text-white leading-tight">
                            {formatPrice(offer.price.pricePerAdult, offer.price.currency, targetCurrency)}<span className="text-[8px] lg:text-xs text-slate-400 dark:text-slate-500">{t('perPersonShort')}</span>
                        </div>
                        <div className="text-[9px] lg:text-xs text-slate-400 dark:text-slate-500">
                            {t('includesTaxesFees')}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 lg:mt-auto">
                        <button
                            onClick={() => onSelect?.(offer)}
                            className="px-4 lg:px-6 py-1 lg:py-2 rounded-full lg:rounded-lg lg:w-auto bg-blue-600 hover:bg-blue-700 text-white font-normal text-[10px] lg:text-sm transition-colors flex items-center justify-center gap-1 shrink-0"
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
