"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Plane, Clock, ArrowRight, Luggage, AlertCircle, ChevronDown, ChevronUp, Shield } from 'lucide-react';
import type { FlightOffer, FlightSegmentDetail } from '@/lib/flights/types';
import { getAirlineName } from '@/lib/flights/types';

// ─── Helpers ─────────────────────────────────────────────────────────

function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatPrice(amount: number, currency: string): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
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

function AirlineLogo({ code }: { code: string }) {
    return (
        <div className={`w-10 h-10 rounded-lg ${AIRLINE_COLORS[code] || 'bg-slate-600'} flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm`}>
            {code}
        </div>
    );
}

// ─── Segment Detail Row ──────────────────────────────────────────────

function SegmentRow({ segment }: { segment: FlightSegmentDetail }) {
    return (
        <div className="flex items-center gap-4 py-2.5 px-1">
            <AirlineLogo code={segment.airline.code} />

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium">{segment.airline.name}</span>
                    <span className="text-slate-300 dark:text-slate-600">·</span>
                    <span>{segment.flightNumber}</span>
                    {segment.aircraft && (
                        <>
                            <span className="text-slate-300 dark:text-slate-600">·</span>
                            <span>{segment.aircraft}</span>
                        </>
                    )}
                </div>

                <div className="flex items-center gap-3 mt-1.5">
                    <div className="text-center min-w-[56px]">
                        <div className="text-base font-semibold text-slate-900 dark:text-white">{formatTime(segment.departure.time)}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{segment.departure.airport}</div>
                    </div>

                    <div className="flex-1 flex flex-col items-center gap-0.5 min-w-[90px]">
                        <span className="text-[11px] text-slate-400 dark:text-slate-500">{formatDuration(segment.duration)}</span>
                        <div className="w-full flex items-center gap-1">
                            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300 dark:via-slate-600 to-transparent" />
                            <Plane className="w-3 h-3 text-indigo-500 rotate-90 shrink-0" />
                            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300 dark:via-slate-600 to-transparent" />
                        </div>
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                            {segment.stops === 0 ? 'Direct' : `${segment.stops} stop(s)`}
                        </span>
                    </div>

                    <div className="text-center min-w-[56px]">
                        <div className="text-base font-semibold text-slate-900 dark:text-white">{formatTime(segment.arrival.time)}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{segment.arrival.airport}</div>
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

    const outbound = offer.segments.filter((_, i) => {
        if (offer.segments.length <= 1) return true;
        return i < Math.ceil(offer.segments.length / 2);
    });

    const returnSegs = offer.segments.length > 1
        ? offer.segments.filter((_, i) => i >= Math.ceil(offer.segments.length / 2))
        : [];

    const primary = offer.segments[0];
    const last = outbound[outbound.length - 1];

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.1 }}
            transition={{ delay: index * 0.04, duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
            className={`
                group relative bg-white dark:bg-slate-900
                rounded-xl overflow-hidden border transition-all duration-200
                ${isSelected
                    ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-lg'
                    : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-lg shadow-sm'
                }
            `}
        >
            <div className="flex flex-col md:flex-row">
                {/* ─── Flight Info (left) ─── */}
                <div className="flex-1 p-4 sm:p-5">
                    {/* Airline header */}
                    <div className="flex items-center gap-3 mb-3">
                        <AirlineLogo code={primary.airline.code} />
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-900 dark:text-white text-sm">
                                    {primary.airline.name}
                                </span>
                                {offer.seatsRemaining && offer.seatsRemaining <= 5 && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
                                        <AlertCircle className="w-3 h-3" />
                                        {offer.seatsRemaining} left
                                    </span>
                                )}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                {primary.flightNumber}
                                {offer.segments.length > 1 && ` + ${offer.segments.length - 1} more`}
                            </div>
                        </div>
                    </div>

                    {/* Route timeline */}
                    <div className="flex items-center gap-3">
                        <div className="text-center">
                            <div className="text-xl font-bold text-slate-900 dark:text-white">{formatTime(primary.departure.time)}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">{primary.departure.airport}</div>
                        </div>

                        <div className="flex-1 flex flex-col items-center gap-0.5">
                            <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">{formatDuration(offer.totalDuration)}</span>
                            <div className="w-full flex items-center gap-1">
                                <div className="h-[2px] flex-1 bg-gradient-to-r from-indigo-400 to-purple-400 rounded-full" />
                                <Plane className="w-4 h-4 text-indigo-500 rotate-90" />
                            </div>
                            <span className={`text-xs font-medium ${offer.totalStops === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                {stopsLabel(offer.totalStops)}
                            </span>
                        </div>

                        <div className="text-center">
                            <div className="text-xl font-bold text-slate-900 dark:text-white">{formatTime(last.arrival.time)}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">{last.arrival.airport}</div>
                        </div>
                    </div>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1.5 mt-3">
                        {offer.baggage && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                                <Luggage className="w-3 h-3" />
                                {offer.baggage.checkedBags > 0 ? `${offer.baggage.checkedBags} bag(s)` : 'No checked bag'}
                            </span>
                        )}
                        {offer.refundable && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400">
                                <Shield className="w-3 h-3" />
                                Refundable
                            </span>
                        )}
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 capitalize">
                            {primary.cabinClass.replace('_', ' ')}
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400">
                            {offer.provider}
                        </span>
                    </div>
                </div>

                {/* ─── Price + CTA (right) ─── */}
                <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-3 md:gap-2 md:w-[180px] p-4 sm:p-5 md:border-l border-t md:border-t-0 border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="text-right">
                        <div className="text-2xl font-bold text-slate-900 dark:text-white">
                            {formatPrice(offer.price.total, offer.price.currency)}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                            {formatPrice(offer.price.pricePerAdult, offer.price.currency)}/person
                        </div>
                        <div className="text-[11px] text-slate-400 dark:text-slate-500">
                            includes taxes & fees
                        </div>
                    </div>

                    <button
                        onClick={() => onSelect?.(offer)}
                        className="w-full md:w-auto px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors flex items-center justify-center gap-1.5"
                    >
                        Select
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* ─── Expand Toggle ─── */}
            {offer.segments.length > 1 && (
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="flex items-center gap-1 px-5 pb-3 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 transition-colors"
                >
                    {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {expanded ? 'Hide details' : 'Show all segments'}
                </button>
            )}

            {/* ─── Expanded Segments ─── */}
            {expanded && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="px-5 pb-4 border-t border-slate-100 dark:border-slate-800 space-y-1"
                >
                    {outbound.length > 0 && (
                        <div className="pt-3">
                            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Outbound</div>
                            {outbound.map((seg, i) => <SegmentRow key={i} segment={seg} />)}
                        </div>
                    )}
                    {returnSegs.length > 0 && (
                        <div className="pt-2">
                            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Return</div>
                            {returnSegs.map((seg, i) => <SegmentRow key={i} segment={seg} />)}
                        </div>
                    )}
                </motion.div>
            )}
        </motion.div>
    );
};

export default FlightCard;
