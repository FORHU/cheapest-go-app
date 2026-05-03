"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Plane, ArrowRight, Luggage, ChevronDown, ChevronUp, 
    Shield, XCircle, BadgeDollarSign, Users, Clock, 
    MapPin, AlertCircle, Info, CreditCard
} from 'lucide-react';
import type { FlightOffer, FlightSegmentDetail } from '@/types/flights';
import { formatPrice } from '@/utils/flight-utils';
import SaveButton from '@/components/common/SaveButton';
import { useUserCurrency } from '@/stores/searchStore';

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

function stopsLabel(stops: number): string {
    if (stops === 0) return 'Nonstop';
    if (stops === 1) return '1 stop';
    return `${stops} stops`;
}

// ─── Airline Logo ────────────────────────────────────────────────────

function AirlineLogo({ code, name, size = "md" }: { code: string | undefined; name?: string, size?: "sm" | "md" | "lg" }) {
    const [failed, setFailed] = useState(false);
    const iata = (code || '').toUpperCase().slice(0, 3);
    const initials = iata.slice(0, 2) || (name || '??').slice(0, 2).toUpperCase();

    const sizeClasses = {
        sm: "w-6 h-6 rounded",
        md: "w-7 h-7 sm:w-9 sm:h-9 lg:w-12 lg:h-12 rounded-md sm:rounded-lg lg:rounded-xl",
        lg: "w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-xl lg:rounded-2xl"
    };

    if (iata && !failed) {
        return (
            <div className={`${sizeClasses[size]} bg-white border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 overflow-hidden shadow-sm`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={`https://pics.avs.io/40/40/${iata}.png`}
                    alt={name || iata}
                    className="w-2/3 h-2/3 object-contain"
                    onError={() => setFailed(true)}
                />
            </div>
        );
    }

    return (
        <div className={`${sizeClasses[size]} bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 font-bold text-[10px] lg:text-sm shrink-0 border border-slate-200 dark:border-slate-700`}>
            {initials}
        </div>
    );
}

// ─── Segment Detail Row ──────────────────────────────────────────────

function SegmentRow({ segment }: { segment: FlightSegmentDetail }) {
    return (
        <div className="flex items-center gap-3 py-3 px-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <AirlineLogo code={segment.airline.code} name={segment.airline.name} size="sm" />

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-[10px] text-slate-500 font-medium">
                    <span className="truncate">{segment.airline.name}</span>
                    <span className="w-1 h-1 rounded-full bg-slate-300" />
                    <span>{segment.flightNumber}</span>
                    {segment.aircraft && (
                        <>
                            <span className="w-1 h-1 rounded-full bg-slate-300" />
                            <span className="truncate">{segment.aircraft}</span>
                        </>
                    )}
                </div>

                <div className="flex items-center gap-4 mt-1">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">{formatTime(segment.departure.time)}</span>
                        <span className="text-[10px] font-bold text-slate-400">{segment.departure.airport}</span>
                    </div>
                    <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800 relative">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-slate-900 px-2 text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                            {formatDuration(segment.duration)}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400">{segment.arrival.airport}</span>
                        <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">{formatTime(segment.arrival.time)}</span>
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

    const legGroups: { [key: number]: FlightSegmentDetail[] } = {};
    offer.segments.forEach((seg, i) => {
        const groupIndex = seg.segmentIndex ?? (offer.segments.length > 1 && i >= Math.ceil(offer.segments.length / 2) ? 1 : 0);
        if (!legGroups[groupIndex]) legGroups[groupIndex] = [];
        legGroups[groupIndex].push(seg);
    });

    const routeIndices = Object.keys(legGroups).map(Number).sort((a, b) => a - b);
    const primary = offer.segments[0];
    const last = offer.segments[offer.segments.length - 1];

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -4, transition: { duration: 0.2 } }}
            className={`
                group relative bg-white dark:bg-slate-900
                rounded-3xl border transition-all duration-300 flex flex-col
                ${isSelected
                    ? 'border-blue-500 ring-4 ring-blue-500/10 shadow-2xl'
                    : 'border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-2xl shadow-sm'
                }
            `}
        >
            {/* ─── Header: Airline + Price ─── */}
            <div className="p-3 sm:p-4 lg:p-6 pb-0 sm:pb-0 lg:pb-0 flex items-start justify-between">
                <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                    <AirlineLogo code={primary.airline.code} name={primary.airline.name} size="md" />
                    <div className="min-w-0">
                        <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base lg:text-lg tracking-tight truncate leading-tight">
                            {primary.airline.name}
                        </h3>
                        <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1">
                            <span className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest">{primary.flightNumber}</span>
                            {offer.segments.length > 1 && (
                                <span className="px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] sm:text-xs font-bold text-slate-500">
                                    {offer.segments.length - 1} stops
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="text-right flex flex-col items-end shrink-0">
                    <div className="text-base sm:text-lg lg:text-2xl font-black text-slate-900 dark:text-white tracking-tighter flex items-start gap-0.5 leading-none sm:leading-tight">
                        <span className="text-xs sm:text-sm mt-0.5 sm:mt-1 opacity-50">$</span>
                        {formatPrice(offer.price.total, offer.price.currency, targetCurrency).replace('$', '')}
                    </div>
                    <div className="text-[10px] sm:text-xs font-black text-blue-500 uppercase tracking-widest mt-0.5">
                        {formatPrice(offer.price.pricePerAdult, offer.price.currency, targetCurrency)} / person
                    </div>
                </div>
            </div>

            {/* ─── Body: Timeline ─── */}
            <div className="p-3 sm:p-4 lg:p-8 flex flex-col gap-2 sm:gap-12">
                <div className="flex flex-col sm:flex-row items-center justify-between w-full gap-2 sm:gap-4 lg:gap-16">
                    {/* Compact Timeline Row (Mobile) / Full Column Group (Desktop) */}
                    <div className="flex items-center justify-between w-full sm:w-auto sm:flex-1 gap-2 sm:gap-12">
                        {/* Departure */}
                        <div className="flex flex-col items-start gap-0.5 sm:gap-1">
                            <div className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 dark:text-white tracking-tighter tabular-nums leading-none">
                                {formatTime(primary.departure.time)}
                            </div>
                            <div className="flex items-center gap-1 sm:gap-1.5">
                                <div className="w-3 h-3 sm:w-5 sm:h-5 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                                    <MapPin size={8} className="text-blue-500 sm:w-[10px] sm:h-[10px]" />
                                </div>
                                <span className="text-[11px] sm:text-xs font-black text-slate-500 uppercase tracking-widest">{primary.departure.airport}</span>
                            </div>
                        </div>

                        {/* Middle: Line & Duration */}
                        <div className="flex-1 flex flex-col items-center gap-1 sm:gap-2 relative pt-0.5 sm:pt-2">
                            <div className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-[10px] sm:text-xs font-black text-slate-500 uppercase tracking-widest">
                                <Clock size={8} className="text-blue-500 sm:w-[10px] sm:h-[10px]" />
                                {formatDuration(offer.totalDuration)}
                            </div>
                            
                            <div className="w-full flex items-center gap-1 sm:gap-2 px-1 sm:px-2">
                                <div className="h-0.5 sm:h-1 flex-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative">
                                    <motion.div 
                                        className="absolute inset-0 bg-blue-500"
                                        initial={{ scaleX: 0, originX: 0 }}
                                        animate={{ scaleX: 1 }}
                                        transition={{ duration: 1.5, ease: "circOut", delay: index * 0.1 }}
                                    />
                                </div>
                                <Plane className="w-3 h-3 sm:w-4 sm:h-4 text-blue-500 rotate-90 shrink-0 filter drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                                <div className="h-0.5 sm:h-1 flex-1 bg-slate-100 dark:bg-slate-800 rounded-full" />
                            </div>

                            <div className={`flex items-center gap-1 text-[11px] sm:text-xs font-bold uppercase tracking-widest sm:tracking-[0.2em] ${offer.totalStops === 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
                                {stopsLabel(offer.totalStops)}
                            </div>
                        </div>

                        {/* Arrival */}
                        <div className="flex flex-col items-end gap-0.5 sm:gap-1">
                            <div className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 dark:text-white tracking-tighter tabular-nums leading-none">
                                {formatTime(last.arrival.time)}
                            </div>
                            <div className="flex items-center gap-1 sm:gap-1.5 justify-end">
                                <span className="text-[11px] sm:text-xs font-black text-slate-500 uppercase tracking-widest">{last.arrival.airport}</span>
                                <div className="w-3 h-3 sm:w-5 sm:h-5 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                                    <MapPin size={8} className="text-blue-500 sm:w-[10px] sm:h-[10px]" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ─── Footer Section ─── */}
            <div className="px-3 sm:px-4 lg:px-8 pb-3 sm:pb-4 lg:pb-8 mt-auto flex flex-col gap-2 sm:gap-6">
                <div className="pt-2 sm:pt-6 border-t border-slate-100 dark:border-slate-800/50 flex flex-col gap-2.5 sm:gap-5">
                    {/* Badge Group */}
                    <div className="flex flex-row flex-wrap items-center gap-1.5 w-full justify-start sm:justify-start">
                        <span className="px-2 py-0.5 sm:px-3 sm:py-1 rounded-lg sm:rounded-xl border border-slate-200 dark:border-slate-800 text-[10px] sm:text-xs font-black text-slate-500 uppercase tracking-widest">
                            {(primary.cabinClass || 'economy').replace('_', ' ')}
                        </span>

                        {(() => {
                            const fp = offer.farePolicy;
                            const isRefundable = fp ? fp.isRefundable : offer.refundable;
                            const penalty = fp?.refundPenaltyAmount;

                            if (isRefundable && penalty === 0) {
                                return (
                                    <span className="flex items-center gap-1 sm:gap-2 px-2 py-0.5 sm:px-3 sm:py-1 rounded-lg sm:rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-[10px] sm:text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest border border-emerald-100 dark:border-emerald-500/20">
                                        <Shield size={10} className="sm:w-[12px] sm:h-[12px]" strokeWidth={3} />
                                        Free Refund
                                    </span>
                                );
                            } else if (isRefundable) {
                                return (
                                    <span className="flex items-center gap-1 sm:gap-2 px-2 py-0.5 sm:px-3 sm:py-1 rounded-lg sm:rounded-xl bg-amber-50 dark:bg-amber-500/10 text-[10px] sm:text-xs font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest border border-amber-100 dark:border-amber-500/20">
                                        <BadgeDollarSign size={10} className="sm:w-[12px] sm:h-[12px]" strokeWidth={3} />
                                        Refundable
                                    </span>
                                );
                            }
                            return (
                                <span className="flex items-center gap-1 sm:gap-2 px-2 py-0.5 sm:px-3 sm:py-1 rounded-lg sm:rounded-xl bg-slate-50 dark:bg-slate-800 text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest border border-slate-100 dark:border-slate-800">
                                    <XCircle size={10} className="sm:w-[12px] sm:h-[12px]" strokeWidth={3} />
                                    Non-refund
                                </span>
                            );
                        })()}

                        {offer.baggage && Number(offer.baggage.checkedBags || 0) > 0 && (
                            <span className="flex items-center gap-1 sm:gap-2 px-2 py-0.5 sm:px-3 sm:py-1 rounded-lg sm:rounded-xl bg-blue-50 dark:bg-blue-500/10 text-[10px] sm:text-xs font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest border border-blue-100 dark:border-blue-500/20">
                                <Luggage size={10} className="sm:w-[12px] sm:h-[12px]" strokeWidth={3} />
                                {offer.baggage.checkedBags} Bag
                            </span>
                        )}
                    </div>

                    {/* Action Group */}
                    <div className="flex items-center gap-2 sm:gap-3 w-full">
                        <div className="shrink-0 [&_button]:w-8 [&_button]:h-8 [&_button_svg]:w-4 [&_button_svg]:h-4 sm:[&_button]:w-10 sm:[&_button]:h-10 sm:[&_button_svg]:w-5 sm:[&_button_svg]:h-5">
                            <SaveButton
                                type="flight"
                                title={`${primary.departure.airport} → ${last.arrival.airport}`}
                                subtitle={`${primary.airline.name} · ${formatDuration(offer.totalDuration)}`}
                                price={offer.price.total}
                                currency={offer.price.currency}
                                imageUrl={`https://pics.avs.io/40/40/${(primary.airline.code || '').toUpperCase()}.png`}
                                size="md"
                                deepLink="#"
                            />
                        </div>
                        <button
                            onClick={() => onSelect?.(offer)}
                            className="flex-1 h-9 sm:h-10 lg:h-12 rounded-xl sm:rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm lg:text-base uppercase tracking-[0.1em] transition-all shadow-lg active:scale-[0.98] flex items-center justify-center gap-2 sm:gap-3"
                        >
                            Select Flight <ArrowRight size={14} className="sm:w-[16px] sm:h-[16px]" strokeWidth={3} />
                        </button>
                    </div>
                </div>

                {/* Details Trigger */}
                <div className="pt-1 sm:pt-2 w-full">
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="w-full flex items-center justify-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs font-black text-slate-400 hover:text-blue-500 transition-all py-1.5 sm:py-2 bg-slate-50/50 dark:bg-slate-800/30 rounded-lg sm:rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 uppercase tracking-widest"
                    >
                        {expanded ? <ChevronUp size={12} className="sm:w-[14px] sm:h-[14px]" strokeWidth={3} /> : <ChevronDown size={12} className="sm:w-[14px] sm:h-[14px]" strokeWidth={3} />}
                        {expanded ? 'Collapse Segments' : 'Details & Stops ↓'}
                    </button>
                </div>
            </div>

            {/* ─── Expanded View ─── */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden bg-slate-50/30 dark:bg-slate-900/50 rounded-b-3xl"
                    >
                        <div className="p-6 lg:p-8 pt-0 space-y-6">
                            {/* Branded Fares / Alternatives */}
                            {offer.alternatives && offer.alternatives.length > 0 && (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        <BadgeDollarSign size={12} className="text-blue-500" />
                                        Fare Options
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        <div className="p-4 rounded-2xl border-2 border-blue-500 bg-white dark:bg-slate-900 shadow-xl">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-[10px] font-black text-blue-500 uppercase bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-lg">Selected</span>
                                                <span className="text-sm font-black text-slate-900 dark:text-white">
                                                    {formatPrice(offer.price.total, offer.price.currency, targetCurrency)}
                                                </span>
                                            </div>
                                            <div className="text-xs font-bold text-slate-500 italic">
                                                {(primary.cabinClass || 'economy').replace('_', ' ')}
                                            </div>
                                        </div>

                                        {offer.alternatives.map((alt) => (
                                            <button 
                                                key={alt.offerId}
                                                onClick={() => onSelect?.(alt)}
                                                className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 hover:border-blue-400 transition-all text-left group/alt"
                                            >
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase group-hover/alt:text-blue-500 transition-colors">
                                                        {alt.brandedFare?.brandName || 'Alternative'}
                                                    </span>
                                                    <span className="text-sm font-black text-slate-900 dark:text-white">
                                                        {formatPrice(alt.price.total, alt.price.currency, targetCurrency)}
                                                    </span>
                                                </div>
                                                <div className="text-xs font-bold text-slate-500 italic">
                                                    {(alt.segments[0].cabinClass || 'economy').replace('_', ' ')}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Detailed Itinerary */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    <Info size={12} className="text-blue-500" />
                                    Flight Itinerary
                                </div>
                                <div className="space-y-2">
                                    {routeIndices.map((idx, routeIndex) => {
                                        const legSegments = legGroups[idx];
                                        if (!legSegments || legSegments.length === 0) return null;
                                        return (
                                            <div key={idx} className="space-y-2">
                                                {legSegments.map((seg, i) => (
                                                    <React.Fragment key={`${idx}-${i}`}>
                                                        <SegmentRow segment={seg} />
                                                        {i < legSegments.length - 1 && (
                                                            <div className="ml-7 pl-6 py-2 border-l-2 border-dashed border-slate-100 dark:border-slate-800 flex items-center gap-3">
                                                                <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                                                                <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">
                                                                    Layover at {seg.arrival.airport}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </React.Fragment>
                                                ))}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default FlightCard;
