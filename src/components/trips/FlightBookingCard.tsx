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

    const fmtDate = (iso: string) =>
        formatDate(new Date(iso), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }, 'en-US');

    const fmtTime = (iso: string) =>
        formatDate(new Date(iso), { hour: '2-digit', minute: '2-digit', hour12: false }, 'en-US').split(', ')[1] || new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <div className="flex flex-col md:flex-row">
                {/* Visual Header */}
                <div className="relative w-full md:w-48 h-40 md:h-auto flex-shrink-0 bg-indigo-50 dark:bg-indigo-950 flex flex-col items-center justify-center p-4">
                    <Plane className="w-10 h-10 text-indigo-400 mb-2" />
                    {firstSegment && (
                        <div className="text-center">
                            <span className="text-sm font-bold text-slate-900 dark:text-white uppercase">{firstSegment.airline}</span>
                        </div>
                    )}
                    {/* Status Badge */}
                    <div className={`absolute top-3 left-3 px-2 py-1 rounded-full text-xs font-semibold ${flightStatusColors[booking.status] || flightStatusColors.booked}`}>
                        {flightStatusLabels[booking.status] || 'Unknown'}
                    </div>
                </div>

                {/* Booking Details */}
                <div className="flex-1 p-4 md:p-5">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                        <div className="flex-1">
                            {/* Route text */}
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3">
                                {firstSegment ? `${firstSegment.origin} to ${lastSegment.destination}` : 'Flight Booking'}
                            </h3>

                            {/* Info Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                                {/* Date and Airports */}
                                {firstSegment && (
                                    <div className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
                                        <Calendar className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="font-medium">{fmtDate(firstSegment.departure)}</p>
                                            <div className="flex items-center gap-1.5 mt-1">
                                                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{fmtTime(firstSegment.departure)}</span>
                                                <span className="text-[10px] text-slate-400">({firstSegment.origin})</span>
                                                <span className="text-slate-400">→</span>
                                                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{fmtTime(lastSegment.arrival)}</span>
                                                <span className="text-[10px] text-slate-400">({lastSegment.destination})</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* PNR */}
                                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                                    <span className="text-indigo-500 font-bold px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/30 text-[10px] uppercase border border-indigo-100 dark:border-indigo-800 shrink-0 mt-0.5">PNR</span>
                                    <span className="font-mono font-medium">{booking.pnr}</span>
                                </div>

                                {/* E-Tickets */}
                                {booking.status === 'ticketed' && booking.passengers && booking.passengers.some(p => p.ticket_number) && (
                                    <div className="flex flex-col gap-1 text-slate-600 dark:text-slate-300">
                                        <div className="flex items-center gap-2">
                                            <span className="text-emerald-500 font-bold px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/30 text-[10px] uppercase border border-emerald-100 dark:border-emerald-800 shrink-0 mt-0.5">E-TKT</span>
                                            <span className="font-medium text-xs">Issued Tickets</span>
                                        </div>
                                        <div className="pl-8 flex flex-col gap-0.5">
                                            {booking.passengers.filter(p => p.ticket_number).map((p, idx) => (
                                                <div key={idx} className="flex justify-between items-center text-[11px]">
                                                    <span className="truncate mr-2 text-slate-500">{p.first_name} {p.last_name}</span>
                                                    <span className="font-mono text-slate-700 dark:text-slate-300">{p.ticket_number}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Passengers */}
                                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                                    <Users className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                                    <span>{booking.passengers?.length || 0} passenger{(booking.passengers?.length || 0) !== 1 && 's'}</span>
                                </div>

                                {/* Stops info */}
                                {segments.length > 0 && (
                                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                                        <Clock className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
                                        <span>{segments.length === 1 ? 'Nonstop' : `${segments.length - 1} stop(s)`}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Price & Status */}
                        <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-start gap-2 pt-3 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-white/5">
                            <div className="text-right">
                                <p className="text-xs text-slate-400 dark:text-slate-500">Total paid</p>
                                <p className="text-xl font-bold text-slate-900 dark:text-white">
                                    {formatCurrency(booking.total_price, 'USD')}
                                </p>
                            </div>

                            {isUpcoming && booking.status === 'ticketed' && (
                                <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded-full">
                                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                                    Upcoming Flight
                                </span>
                            )}

                            {isPast && booking.status === 'ticketed' && (
                                <span className="text-xs text-slate-400">
                                    Flight completed
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
