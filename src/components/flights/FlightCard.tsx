"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Plane, Clock, ArrowRight, Luggage, AlertCircle, ChevronDown, ChevronUp, Shield, XCircle, BadgeDollarSign } from 'lucide-react';
import type { FlightOffer, FlightSegmentDetail, FarePolicy } from '@/lib/flights/types';
import { getAirlineName } from '@/lib/flights/types';


import { useUserCurrency } from '@/stores/searchStore';
import { EXCHANGE_RATES } from '@/lib/currency';

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


function formatPrice(amount: number, currency: string, targetCurrency?: string): string {
    const from = currency?.toUpperCase();
    const to = targetCurrency?.toUpperCase();

    let displayAmount = amount;
    let displayCurrency = from;

    if (to && from !== to) {
        const rateFrom = EXCHANGE_RATES[from] || 1;
        const rateTo = EXCHANGE_RATES[to] || 1;
        displayAmount = (amount * rateFrom) / rateTo;
        displayCurrency = to;
    }

    // Special case for PHP/KRW if Intl is flaky in some environments
    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: displayCurrency || 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(displayAmount);
    } catch (e) {
        const symbols: Record<string, string> = { 'PHP': '₱', 'KRW': '₩', 'USD': '$' };
        const symbol = symbols[displayCurrency] || displayCurrency;
        return `${symbol}${Math.round(displayAmount).toLocaleString()}`;
    }
}

function stopsLabel(stops: number): string {
    if (stops === 0) return 'Nonstop';
    if (stops === 1) return '1 stop';
    return `${stops} stops`;
}

// ─── Airline Logo ────────────────────────────────────────────────────

const AIRLINE_COLORS: Record<string, string> = {
    'KE': 'bg-sky-600', 'OZ': 'bg-emerald-600', 'PR': 'bg-blue-700', '5J': 'bg-yellow-500',
    'SQ': 'bg-amber-700', 'AA': 'bg-red-600', 'DL': 'bg-blue-800', 'UA': 'bg-blue-600',
    'BA': 'bg-indigo-800', 'LH': 'bg-yellow-600', 'EK': 'bg-red-700', 'QR': 'bg-purple-800',
    'TK': 'bg-red-600', 'AF': 'bg-blue-600', 'CX': 'bg-emerald-700', 'JL': 'bg-rose-700',
    'NH': 'bg-blue-500', 'TG': 'bg-purple-600', 'VN': 'bg-teal-600', 'GA': 'bg-sky-700',
};

function AirlineLogo({ code }: { code: string | undefined }) {
    const c = code || '??';
    return (
        <div className={`w-7 h-7 lg:w-10 lg:h-10 rounded-md lg:rounded-lg ${AIRLINE_COLORS[c] || 'bg-slate-600'} flex items-center justify-center text-white font-bold text-[10px] lg:text-sm shrink-0`}>
            {c}
        </div>
    );
}

// ─── Segment Detail Row ──────────────────────────────────────────────

function SegmentRow({ segment }: { segment: FlightSegmentDetail }) {
    return (
        <div className="flex items-center gap-2 lg:gap-4 py-1.5 lg:py-2.5 px-1">
            <AirlineLogo code={segment.airline.code} />

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
                            {segment.stops === 0 ? 'Direct' : `${segment.stops} stop(s)`}
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

    // Group segments by their logical segment index (each search leg)
    const legGroups: { [key: number]: FlightSegmentDetail[] } = {};
    offer.segments.forEach((seg, i) => {
        // Fallback to array split if segmentIndex is mysteriously missing from older APIs
        const groupIndex = seg.segmentIndex ?? (offer.segments.length > 1 && i >= Math.ceil(offer.segments.length / 2) ? 1 : 0);
        if (!legGroups[groupIndex]) legGroups[groupIndex] = [];
        legGroups[groupIndex].push(seg);
    });

    const routeIndices = Object.keys(legGroups).map(Number).sort((a, b) => a - b);

    // Primary metrics for the collapsed card view
    const primary = offer.segments[0];
    const last = offer.segments[offer.segments.length - 1];

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03, duration: 0.25 }}
            className={`
                group relative bg-white dark:bg-slate-900
                rounded-xl overflow-hidden border transition-all duration-200
                ${isSelected
                    ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-lg'
                    : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-lg shadow-sm'
                }
            `}
        >
            <div className="flex flex-col lg:flex-row">
                {/* ─── Flight Info (left) ─── */}
                <div className="flex-1 px-2.5 pt-2.5 pb-2 lg:p-5">
                    {/* Airline header */}
                    <div className="flex items-center gap-1.5 lg:gap-3 mb-1.5 lg:mb-3">
                        <AirlineLogo code={primary.airline.code} />
                        <div className="min-w-0">
                            <div className="flex items-center gap-1 lg:gap-2">
                                <span className="font-semibold text-slate-900 dark:text-white text-xs lg:text-sm">
                                    {primary.airline.name}
                                </span>
                                {offer.seatsRemaining && offer.seatsRemaining <= 5 && (
                                    <span className="inline-flex items-center gap-0.5 px-1 lg:px-2 py-px lg:py-0.5 rounded-full text-[9px] lg:text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
                                        <AlertCircle className="w-2 h-2 lg:w-3 lg:h-3" />
                                        {offer.seatsRemaining} left
                                    </span>
                                )}
                            </div>
                            <div className="text-[10px] lg:text-xs text-slate-500 dark:text-slate-400">
                                {primary.flightNumber}
                                {offer.segments.length > 1 && ` + ${offer.segments.length - 1} more`}
                            </div>
                        </div>
                    </div>

                    {/* Route timeline */}
                    <div className="flex items-center gap-1.5 lg:gap-3">
                        <div className="text-center">
                            <div className="text-base lg:text-lg font-bold text-slate-900 dark:text-white leading-tight">{formatTime(primary.departure.time)}</div>
                            <div className="text-[9px] lg:text-[10px] text-slate-500 dark:text-slate-400 font-medium">{primary.departure.airport}</div>
                        </div>

                        <div className="flex-1 flex flex-col items-center gap-0">
                            <span className="text-xs lg:text-sm text-slate-400 dark:text-slate-500 font-medium">{formatDuration(offer.totalDuration)}</span>
                            <div className="w-full flex items-center gap-0.5">
                                <div className="h-[1.5px] lg:h-[2px] flex-1 bg-gradient-to-r from-indigo-400 to-purple-400 rounded-full" />
                                <Plane className="w-2.5 h-2.5 lg:w-4 lg:h-4 text-indigo-500 rotate-90" />
                            </div>
                            <span className={`text-xs lg:text-sm font-medium ${offer.totalStops === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                {stopsLabel(offer.totalStops)}
                            </span>
                        </div>

                        <div className="text-center">
                            <div className="text-base lg:text-lg font-bold text-slate-900 dark:text-white leading-tight">{formatTime(last.arrival.time)}</div>
                            <div className="text-[9px] lg:text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                                {last.arrival.airport}
                            </div>
                        </div>
                    </div>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-0.5 lg:gap-1.5 mt-1.5 lg:mt-3">
                        {offer.baggage && (
                            <span className="inline-flex items-center gap-0.5 px-1 lg:px-2 py-px lg:py-0.5 rounded-full text-[9px] lg:text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                                <Luggage className="w-2 h-2 lg:w-3 lg:h-3" />
                                {Number(offer.baggage.checkedBags || 0) > 0 ? `${offer.baggage.checkedBags} bag(s)` : 'No bag'}
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
                                    <span className="inline-flex items-center gap-0.5 px-1 lg:px-2 py-px lg:py-0.5 rounded-full text-[9px] lg:text-xs bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400">
                                        <Shield className="w-2 h-2 lg:w-3 lg:h-3" />
                                        Free cancellation
                                    </span>
                                );
                            } else if (isRefundable) {
                                // 🟡 Refundable with fee OR unknown penalty amount
                                const feeLabel = penalty != null && penalty > 0
                                    ? `Refundable (fee: ${fp?.refundPenaltyCurrency ?? ''}${penalty})`
                                    : 'Refundable (fees may apply)';
                                return (
                                    <span className="inline-flex items-center gap-0.5 px-1 lg:px-2 py-px lg:py-0.5 rounded-full text-[9px] lg:text-xs bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400">
                                        <BadgeDollarSign className="w-2 h-2 lg:w-3 lg:h-3" />
                                        {feeLabel}
                                    </span>
                                );
                            } else {
                                // 🔴 Non-refundable
                                return (
                                    <span className="inline-flex items-center gap-0.5 px-1 lg:px-2 py-px lg:py-0.5 rounded-full text-[9px] lg:text-xs bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400">
                                        <XCircle className="w-2 h-2 lg:w-3 lg:h-3" />
                                        Non-refundable
                                    </span>
                                );
                            }
                        })()}
                        <span className="inline-flex items-center px-1 lg:px-2 py-px lg:py-0.5 rounded-full text-[9px] lg:text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 capitalize">
                            {(primary.cabinClass || 'economy').replace('_', ' ')}
                        </span>
                        <span className="inline-flex items-center px-1 lg:px-2 py-px lg:py-0.5 rounded-full text-[9px] lg:text-xs bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400">
                            {offer.provider}
                        </span>
                        {offer.alternatives && offer.alternatives.length > 0 && (
                            <span className="inline-flex items-center gap-0.5 px-1 lg:px-2 py-px lg:py-0.5 rounded-full text-[9px] lg:text-xs bg-indigo-600 text-white font-bold animate-pulse shadow-sm shadow-indigo-500/50">
                                <BadgeDollarSign className="w-2 h-2 lg:w-3 lg:h-3" />
                                {offer.alternatives.length + 1} brands available
                            </span>
                        )}
                        {primary.aircraft && (
                            <span className="inline-flex items-center gap-0.5 px-1 lg:px-2 py-px lg:py-0.5 rounded-full text-[9px] lg:text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                                <Plane className="w-2 h-2 lg:w-3 lg:h-3" />
                                {primary.aircraft}
                            </span>
                        )}
                    </div>
                </div>

                {/* ─── Price + CTA (right) ─── */}
                <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between lg:justify-center gap-1.5 lg:gap-2 lg:w-[180px] px-2.5 py-2 lg:p-5 lg:border-l border-t lg:border-t-0 border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="lg:text-right">
                        <div className="text-base lg:text-xl font-bold text-slate-900 dark:text-white leading-tight">
                            {formatPrice(offer.price.total, offer.price.currency, targetCurrency)}
                        </div>
                        <div className="text-xs lg:text-sm text-slate-500 dark:text-slate-400">
                            {formatPrice(offer.price.pricePerAdult, offer.price.currency, targetCurrency)}/person
                        </div>
                        <div className="text-[9px] lg:text-xs text-slate-400 dark:text-slate-500 hidden sm:block">
                            includes taxes & fees
                        </div>
                    </div>

                    <button
                        onClick={() => onSelect?.(offer)}
                        className="px-4 lg:px-6 py-1 lg:py-2 rounded-full lg:rounded-lg lg:w-auto bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs lg:text-base transition-colors flex items-center justify-center gap-1 shrink-0"
                    >
                        Select
                        <ArrowRight className="w-3 h-3 lg:w-4 lg:h-4" />
                    </button>
                </div>
            </div>

            {/* ─── Expand Toggle ─── */}
            {offer.segments.length > 1 && (
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="flex items-center gap-0.5 px-2.5 lg:px-5 pb-1.5 lg:pb-3 text-xs lg:text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 transition-colors"
                >
                    {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {expanded ? 'Hide details' : (offer.alternatives && offer.alternatives.length > 0 ? `Compare ${offer.alternatives.length + 1} options` : 'Show all segments')}
                </button>
            )}

            {/* ─── Expanded View (Details + Alternatives) ─── */}
            {expanded && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-slate-100 dark:border-slate-800"
                >
                    {/* Alternatives / Brands Section */}
                    {offer.alternatives && offer.alternatives.length > 0 && (
                        <div className="bg-slate-50/50 dark:bg-slate-800/20 px-2.5 lg:px-5 py-3 border-b border-slate-100 dark:border-slate-800">
                            <h4 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <BadgeDollarSign className="w-3.5 h-3.5 text-indigo-500" />
                                Available Fare Options
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                {/* Current main offer as one of the options */}
                                <div className="flex flex-col p-2.5 rounded-lg border-2 border-indigo-500 bg-white dark:bg-slate-900 shadow-sm">
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 rounded uppercase">
                                            {offer.brandedFare?.brandName || offer.brandedFare?.fareType || 'Standard'}
                                        </span>
                                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                                            {formatPrice(offer.price.total, offer.price.currency, targetCurrency)}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2 italic mb-2">
                                        {(offer.segments[0].cabinClass || 'economy').replace('_', ' ')} · Best value
                                    </p>
                                    <button
                                        disabled
                                        className="mt-auto py-1 px-3 rounded bg-indigo-600 text-white text-[10px] font-bold opacity-50 cursor-default"
                                    >
                                        Currently Selected
                                    </button>
                                </div>

                                {/* Alternatives */}
                                {offer.alternatives.map((alt) => (
                                    <div key={alt.offerId} className="flex flex-col p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-indigo-300 transition-colors">
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded uppercase">
                                                {alt.brandedFare?.brandName || alt.brandedFare?.fareType || 'Option'}
                                            </span>
                                            <span className="text-xs font-bold text-slate-900 dark:text-white">
                                                {formatPrice(alt.price.total, alt.price.currency, targetCurrency)}
                                            </span>
                                        </div>
                                        <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2 italic mb-2">
                                            {(alt.segments[0].cabinClass || 'economy').replace('_', ' ')} · {alt.provider}
                                        </p>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onSelect?.(alt);
                                            }}
                                            className="mt-auto py-1 px-3 rounded bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white text-slate-700 dark:text-slate-300 text-[10px] font-bold transition-colors"
                                        >
                                            Select {alt.brandedFare?.brandName || alt.brandedFare?.fareType || 'this'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Flight Detail Segments */}
                    <div className="px-2.5 lg:px-5 pb-2 lg:pb-4 space-y-0.5 lg:space-y-1">
                        {routeIndices.map((idx, routeIndex) => {
                            const legSegments = legGroups[idx];
                            if (!legSegments || legSegments.length === 0) return null;

                            let label = `Leg ${routeIndex + 1}`;
                            if (routeIndices.length === 2) {
                                label = routeIndex === 0 ? 'Outbound' : 'Return';
                            }

                            return (
                                <div className="pt-3" key={idx}>
                                    <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                                        {label}
                                    </div>
                                    {legSegments.map((seg, i) => <SegmentRow key={`${idx}-${i}`} segment={seg} />)}
                                </div>
                            );
                        })}
                    </div>
                </motion.div>
            )}
        </motion.div>
    );
};

export default FlightCard;
