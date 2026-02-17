"use client";

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Plane, Clock, ArrowRight, Luggage, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import type { FlightOffer, FlightSegmentDetail } from '@/lib/flights';
import { getAirlineName } from '@/lib/flights';

// ─── Helpers ─────────────────────────────────────────────────────────

function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

function getStopsLabel(stops: number): string {
    if (stops === 0) return 'Nonstop';
    if (stops === 1) return '1 stop';
    return `${stops} stops`;
}

// ─── Airline Logo Component ──────────────────────────────────────────

function AirlineLogo({ code, name }: { code: string; name: string }) {
    // Use a colored initials circle as fallback
    const colors: Record<string, string> = {
        'KE': 'bg-sky-600', 'OZ': 'bg-emerald-600', 'PR': 'bg-blue-700', '5J': 'bg-yellow-500',
        'SQ': 'bg-amber-700', 'AA': 'bg-red-600', 'DL': 'bg-blue-800', 'UA': 'bg-blue-600',
        'BA': 'bg-indigo-800', 'LH': 'bg-yellow-600', 'EK': 'bg-red-700', 'QR': 'bg-purple-800',
        'TK': 'bg-red-600', 'AF': 'bg-blue-600', 'CX': 'bg-emerald-700',
    };

    return (
        <div className={`w-10 h-10 rounded-lg ${colors[code] || 'bg-slate-600'} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
            {code}
        </div>
    );
}

// ─── Segment Row ─────────────────────────────────────────────────────

function SegmentRow({ segment }: { segment: FlightSegmentDetail }) {
    return (
        <div className="flex items-center gap-4 py-2">
            <AirlineLogo code={segment.airline.code} name={segment.airline.name} />

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>{segment.airline.name}</span>
                    <span className="text-slate-300 dark:text-slate-600">·</span>
                    <span>{segment.flightNumber}</span>
                    {segment.aircraft && (
                        <>
                            <span className="text-slate-300 dark:text-slate-600">·</span>
                            <span>{segment.aircraft}</span>
                        </>
                    )}
                </div>

                <div className="flex items-center gap-3 mt-1">
                    {/* Departure */}
                    <div className="text-center min-w-[60px]">
                        <div className="text-lg font-semibold text-slate-900 dark:text-white">{formatTime(segment.departure.time)}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{segment.departure.airport}</div>
                    </div>

                    {/* Duration line */}
                    <div className="flex-1 flex flex-col items-center gap-0.5 min-w-[100px]">
                        <span className="text-xs text-slate-400 dark:text-slate-500">{formatDuration(segment.duration)}</span>
                        <div className="w-full flex items-center gap-1">
                            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300 dark:via-slate-600 to-transparent" />
                            <Plane className="w-3 h-3 text-indigo-500 rotate-90 shrink-0" />
                            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300 dark:via-slate-600 to-transparent" />
                        </div>
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                            {segment.stops === 0 ? 'Direct' : `${segment.stops} stop(s)`}
                        </span>
                    </div>

                    {/* Arrival */}
                    <div className="text-center min-w-[60px]">
                        <div className="text-lg font-semibold text-slate-900 dark:text-white">{formatTime(segment.arrival.time)}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{segment.arrival.airport}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Flight Card ─────────────────────────────────────────────────────

interface FlightCardProps {
    offer: FlightOffer;
    onSelect?: (offer: FlightOffer) => void;
    isSelected?: boolean;
}

export const FlightCard: React.FC<FlightCardProps> = ({ offer, onSelect, isSelected = false }) => {
    const [expanded, setExpanded] = useState(false);

    // Group segments by itinerary leg (outbound vs return)
    // For simplicity: first half of segments = outbound, second half = return
    const outboundSegments = offer.segments.filter((_, i) => {
        if (offer.segments.length <= 1) return true;
        // Split at midpoint for round-trip visuals
        return i < Math.ceil(offer.segments.length / 2);
    });

    const returnSegments = offer.segments.length > 1
        ? offer.segments.filter((_, i) => i >= Math.ceil(offer.segments.length / 2))
        : [];

    const primarySegment = offer.segments[0];
    const lastSegment = outboundSegments[outboundSegments.length - 1];

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className={`
                group relative bg-white dark:bg-slate-800/80 
                rounded-2xl border transition-all duration-200
                ${isSelected
                    ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-lg'
                    : 'border-slate-200 dark:border-slate-700/50 hover:border-indigo-300 dark:hover:border-indigo-500/40 hover:shadow-md'
                }
            `}
        >
            <div className="p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    {/* ─── Flight Info ─── */}
                    <div className="flex-1 min-w-0">
                        {/* Main route summary */}
                        <div className="flex items-center gap-3">
                            <AirlineLogo code={primarySegment.airline.code} name={primarySegment.airline.name} />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-slate-900 dark:text-white">
                                        {primarySegment.airline.name}
                                    </span>
                                    {offer.seatsRemaining && offer.seatsRemaining <= 5 && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
                                            <AlertCircle className="w-3 h-3" />
                                            {offer.seatsRemaining} left
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    {primarySegment.flightNumber}
                                    {offer.segments.length > 1 && ` + ${offer.segments.length - 1} more`}
                                </div>
                            </div>
                        </div>

                        {/* Route Timeline */}
                        <div className="flex items-center gap-3 mt-3">
                            <div className="text-center">
                                <div className="text-xl font-bold text-slate-900 dark:text-white">{formatTime(primarySegment.departure.time)}</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">{primarySegment.departure.airport}</div>
                            </div>

                            <div className="flex-1 flex flex-col items-center gap-0.5">
                                <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">{formatDuration(offer.totalDuration)}</span>
                                <div className="w-full flex items-center gap-1">
                                    <div className="h-[2px] flex-1 bg-gradient-to-r from-indigo-400 to-purple-400 rounded-full" />
                                    <Plane className="w-4 h-4 text-indigo-500 rotate-90" />
                                </div>
                                <span className={`text-xs font-medium ${offer.totalStops === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                    {getStopsLabel(offer.totalStops)}
                                </span>
                            </div>

                            <div className="text-center">
                                <div className="text-xl font-bold text-slate-900 dark:text-white">{formatTime(lastSegment.arrival.time)}</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">{lastSegment.arrival.airport}</div>
                            </div>
                        </div>

                        {/* Tags */}
                        <div className="flex flex-wrap gap-1.5 mt-3">
                            {offer.baggage && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                    <Luggage className="w-3 h-3" />
                                    {offer.baggage.checkedBags > 0 ? `${offer.baggage.checkedBags} bag(s)` : 'No checked bag'}
                                </span>
                            )}
                            {offer.refundable && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                                    Refundable
                                </span>
                            )}
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 capitalize">
                                {primarySegment.cabinClass.replace('_', ' ')}
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                                {offer.provider}
                            </span>
                        </div>
                    </div>

                    {/* ─── Price + CTA ─── */}
                    <div className="flex flex-row sm:flex-col items-center sm:items-end gap-3 sm:gap-2 sm:min-w-[140px] border-t sm:border-t-0 sm:border-l border-slate-100 dark:border-slate-700/50 pt-3 sm:pt-0 sm:pl-5">
                        <div className="text-right">
                            <div className="text-2xl font-bold text-slate-900 dark:text-white">
                                {formatPrice(offer.price.total, offer.price.currency)}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                                {formatPrice(offer.price.pricePerAdult, offer.price.currency)}/person
                            </div>
                        </div>

                        <button
                            onClick={() => onSelect?.(offer)}
                            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium text-sm transition-all hover:shadow-lg hover:shadow-indigo-500/25 active:scale-95 whitespace-nowrap"
                        >
                            Select Flight
                        </button>
                    </div>
                </div>

                {/* ─── Expand Toggle ─── */}
                {offer.segments.length > 1 && (
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="flex items-center gap-1 mt-3 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 transition-colors"
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
                        className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50 space-y-1"
                    >
                        {outboundSegments.length > 0 && (
                            <div>
                                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Outbound</div>
                                {outboundSegments.map((seg, i) => (
                                    <SegmentRow key={i} segment={seg} />
                                ))}
                            </div>
                        )}
                        {returnSegments.length > 0 && (
                            <div className="mt-2">
                                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Return</div>
                                {returnSegments.map((seg, i) => (
                                    <SegmentRow key={i} segment={seg} />
                                ))}
                            </div>
                        )}
                    </motion.div>
                )}
            </div>
        </motion.div>
    );
};

export default FlightCard;
