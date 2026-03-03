"use client";

import React from 'react';
import { Plane, Calendar, Clock, Users, CheckCircle, XCircle } from 'lucide-react';
import type { FlightBookingRecord } from '@/services/booking.service';
import { formatDate, formatCurrency } from '@/lib/utils';
import { getAirlineName } from '@/lib/flights/types';

interface FlightBookingCardProps {
    booking: FlightBookingRecord;
}

const flightStatusColors: Record<string, string> = {
    booked: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    ticketed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    cancelled: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-400',
};

const flightStatusLabels: Record<string, string> = {
    booked: 'Processing',
    ticketed: 'Confirmed',
    failed: 'Failed',
    cancelled: 'Cancelled',
};

export default function FlightBookingCard({ booking }: FlightBookingCardProps) {
    const segments = booking.flight_segments || [];
    const firstSegment = segments[0];
    const lastSegment = segments[segments.length - 1];

    const isUpcoming = firstSegment && new Date(firstSegment.departure) > new Date();
    const isPast = lastSegment && new Date(lastSegment.arrival) < new Date();

    let tripType = 'One-way';
    let mainDestination = lastSegment?.destination;
    const origin = firstSegment?.origin;

    // Use the authoritative trip_type stored in DB; fall back to segment inference for older records
    if (booking.trip_type) {
        const map: Record<string, string> = {
            'one-way': 'One-way',
            'round-trip': 'Round-trip',
            'multi-city': 'Multi-city',
        };
        tripType = map[booking.trip_type] ?? 'One-way';

        // For round-trip, find the turnaround destination
        if (booking.trip_type === 'round-trip' && segments.length > 1 && origin) {
            let maxLayover = -1;
            let turnAroundSegment = segments[0];
            for (let i = 0; i < segments.length - 1; i++) {
                const layover = new Date(segments[i + 1].departure).getTime() - new Date(segments[i].arrival).getTime();
                if (layover > maxLayover) {
                    maxLayover = layover;
                    turnAroundSegment = segments[i];
                }
            }
            mainDestination = turnAroundSegment?.destination || mainDestination;
        }
    } else if (segments.length > 1 && origin && lastSegment) {
        if (origin === lastSegment.destination) {
            tripType = 'Round-trip';

            // Find turnaround point by finding the longest layover
            let maxLayover = -1;
            let turnAroundSegment = segments[0];

            for (let i = 0; i < segments.length - 1; i++) {
                const layover = new Date(segments[i + 1].departure).getTime() - new Date(segments[i].arrival).getTime();
                if (layover > maxLayover) {
                    maxLayover = layover;
                    turnAroundSegment = segments[i];
                }
            }
            mainDestination = turnAroundSegment?.destination || mainDestination;
        } else {
            // Check if it's Multi-city (gap in airports or layover > 24h)
            let hasLongLayoverOrGap = false;
            for (let i = 0; i < segments.length - 1; i++) {
                if (segments[i].destination !== segments[i + 1].origin) {
                    hasLongLayoverOrGap = true;
                    break;
                }
                const layover = new Date(segments[i + 1].departure).getTime() - new Date(segments[i].arrival).getTime();
                if (layover > 24 * 60 * 60 * 1000) {
                    hasLongLayoverOrGap = true;
                    break;
                }
            }
            if (hasLongLayoverOrGap) {
                tripType = 'Multi-city';
            }
        }
    }

    const fmtDate = (iso: string) =>
        formatDate(new Date(iso), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }, 'en-US');

    const fmtTime = (iso: string) =>
        formatDate(new Date(iso), { hour: '2-digit', minute: '2-digit', hour12: false }, 'en-US').split(', ')[1] || new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

    return (
        <div className="bg-white dark:bg-slate-900 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all group cursor-default">

            {/* ── MOBILE layout: compact horizontal list ── */}
            <div className="flex flex-row md:hidden min-h-[96px]">
                {/* Visual Header */}
                <div className="relative w-24 min-h-[96px] flex-shrink-0 bg-indigo-50 dark:bg-indigo-950 flex flex-col items-center justify-center rounded-l-lg border-r border-slate-100 dark:border-slate-800">
                    <Plane className="w-6 h-6 text-indigo-400 mb-1" />
                    {firstSegment && (
                        <div className="text-center px-1">
                            <span className="text-[clamp(0.6rem,1.5vw,0.7rem)] font-bold text-slate-900 dark:text-white uppercase truncate block w-full">{firstSegment.airline}</span>
                        </div>
                    )}
                    {/* Status Badge */}
                    <div className="absolute top-1 left-1 flex flex-col gap-1">
                        <span className={`text-[clamp(0.5rem,1.5vw,0.5625rem)] font-semibold px-1.5 py-0.5 rounded shadow ${flightStatusColors[booking.status] || flightStatusColors.booked}`}>
                            {flightStatusLabels[booking.status] || 'Unknown'}
                        </span>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 p-2.5 flex flex-col min-w-0">
                    <h3 className="text-[clamp(0.75rem,2vw,0.875rem)] font-bold text-slate-900 dark:text-white mb-0.5 leading-tight truncate">
                        {firstSegment ? `${origin} to ${mainDestination}` : 'Flight Booking'}
                    </h3>

                    {firstSegment && lastSegment && (
                        <div className="text-[clamp(0.625rem,1.5vw,0.75rem)] text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1.5 truncate">
                            <span className="bg-slate-100 dark:bg-slate-800 px-1 rounded font-medium shrink-0">{tripType}</span>
                            <span className="truncate">{fmtDate(firstSegment.departure)} · {fmtTime(firstSegment.departure)} → {fmtTime(lastSegment.arrival)}</span>
                        </div>
                    )}

                    <div className="text-[clamp(0.625rem,1.5vw,0.75rem)] text-slate-500 dark:text-slate-400 mb-1.5 flex flex-wrap gap-2">
                        <span className="font-mono">{booking.pnr}</span>
                        <span>·</span>
                        <span>{booking.passengers?.length || 0} pax</span>
                    </div>

                    <div className="mt-auto flex items-center justify-between">
                        <span className="text-[clamp(0.875rem,2.5vw,1rem)] font-bold text-slate-900 dark:text-white">
                            {formatCurrency(booking.total_price, 'USD')}
                        </span>
                        {isUpcoming && booking.status === 'ticketed' && (
                            <span className="text-[clamp(0.5rem,1.5vw,0.5625rem)] text-emerald-600 dark:text-emerald-400 font-medium whitespace-nowrap">
                                Upcoming
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* ── DESKTOP layout: compact horizontal list ── */}
            <div className="hidden md:flex flex-row min-h-[112px]">
                {/* Visual Header */}
                <div className="relative w-32 min-h-[112px] lg:w-36 lg:min-h-[112px] flex-shrink-0 bg-indigo-50 dark:bg-indigo-950 flex flex-col items-center justify-center rounded-l-lg border-r border-slate-100 dark:border-slate-800 transition-colors">
                    <Plane className="w-8 h-8 text-indigo-400 mb-1.5 group-hover:scale-110 transition-transform duration-300" />
                    {firstSegment && (
                        <div className="text-center px-2 relative z-10 w-full">
                            <span className="text-[clamp(0.75rem,2vw,0.875rem)] font-bold text-slate-900 dark:text-white uppercase truncate block w-full text-center px-2">{firstSegment.airline}</span>
                        </div>
                    )}
                    {/* Status Badge */}
                    <div className="absolute top-1.5 left-1.5 flex flex-col gap-1 z-20">
                        <span className={`text-[clamp(0.5625rem,1.5vw,0.625rem)] font-semibold px-1.5 py-0.5 rounded shadow ${flightStatusColors[booking.status] || flightStatusColors.booked}`}>
                            {flightStatusLabels[booking.status] || 'Unknown'}
                        </span>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 p-3 flex flex-col min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0">{tripType}</span>
                        <h3 className="text-[clamp(0.75rem,2vw,0.875rem)] font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                            {firstSegment ? `${origin} to ${mainDestination}` : 'Flight Booking'}
                        </h3>
                    </div>

                    <div className="flex flex-wrap items-start gap-4 text-[clamp(0.625rem,1.5vw,0.75rem)] text-slate-500 dark:text-slate-400 mb-2">
                        {/* Dates / Times */}
                        {firstSegment && (
                            <div className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                <div>
                                    <span className="font-medium text-slate-700 dark:text-slate-300 mr-1.5">{fmtDate(firstSegment.departure)}</span>
                                    <span>
                                        {fmtTime(firstSegment.departure)} <span className="text-[10px]">({firstSegment.origin})</span> → {fmtTime(lastSegment.arrival)} <span className="text-[10px]">({lastSegment.destination})</span>
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* PNR */}
                        <div className="flex items-center gap-1.5">
                            <span className="text-indigo-500 font-bold px-1 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/30 text-[9px] uppercase border border-indigo-100 dark:border-indigo-800 shrink-0">PNR</span>
                            <span className="font-mono font-medium">{booking.pnr}</span>
                        </div>

                        {/* Passengers */}
                        <div className="flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-green-500 shrink-0" />
                            <span>{booking.passengers?.length || 0} passenger{(booking.passengers?.length || 0) !== 1 && 's'}</span>
                        </div>

                        {/* Stops */}
                        {segments.length > 0 && (
                            <div className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                                <span>{segments.length === 1 ? 'Nonstop' : `${segments.length - 1} stop(s)`}</span>
                            </div>
                        )}
                    </div>

                    {/* eTickets bottom section */}
                    <div className="mt-auto">
                        {booking.status === 'ticketed' && booking.passengers && booking.passengers.some(p => p.ticket_number) && (
                            <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-emerald-500 font-bold px-1 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/30 text-[9px] uppercase border border-emerald-100 dark:border-emerald-800 shrink-0">E-TKT</span>
                                    <span className="font-medium text-[11px] text-slate-600 dark:text-slate-300">Issued Tickets</span>
                                </div>
                                <div className="flex flex-wrap gap-2 text-[10px]">
                                    {booking.passengers.filter(p => p.ticket_number).map((p, idx) => (
                                        <span key={idx} className="text-slate-500">
                                            {p.first_name} {p.last_name} <span className="text-slate-300 dark:text-slate-600">|</span> <span className="font-mono text-slate-700 dark:text-slate-300">{p.ticket_number}</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right panel — status & price */}
                <div className="flex flex-col items-end justify-center w-[120px] lg:w-[140px] p-3 border-l border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="text-right w-full mb-1">
                        <div className="text-[clamp(0.5625rem,1.5vw,0.625rem)] text-slate-500 dark:text-slate-400 mb-0.5">Total paid</div>
                        <span className="text-[clamp(0.875rem,2.5vw,1rem)] font-bold text-slate-900 dark:text-white">
                            {formatCurrency(booking.total_price, 'USD')}
                        </span>
                    </div>

                    <div className="mt-1 flex flex-col items-end gap-1 w-full">
                        {isUpcoming && booking.status === 'ticketed' && (
                            <span className="inline-flex items-center justify-end w-full gap-1 text-[clamp(0.5625rem,1.5vw,0.625rem)] text-emerald-600 dark:text-emerald-400 whitespace-nowrap font-medium">
                                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shrink-0" />
                                Upcoming Flight
                            </span>
                        )}
                        {isPast && booking.status === 'ticketed' && (
                            <span className="text-[clamp(0.5625rem,1.5vw,0.625rem)] text-slate-400 whitespace-nowrap">
                                Flight completed
                            </span>
                        )}
                        {booking.status === 'cancelled' && (
                            <span className="text-[clamp(0.5625rem,1.5vw,0.625rem)] text-red-500 dark:text-red-400 whitespace-nowrap">
                                Cancelled
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
