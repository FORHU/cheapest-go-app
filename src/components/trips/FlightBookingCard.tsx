"use client";

import React, { useState } from 'react';
import { Calendar, Clock, Users, CheckCircle, XCircle, AlertTriangle, Loader2, RefreshCw, RotateCcw } from 'lucide-react';
import type { FlightBookingRecord } from '@/services/booking.service';
import { formatDate, formatCurrency } from '@/lib/utils';
import { getAirlineName } from '@/utils/flight-utils';

interface FlightBookingCardProps {
    booking: FlightBookingRecord;
    onCancelled?: (bookingId: string) => void;
}

// ─── Status config (includes all cancellation states) ───────────────

const flightStatusColors: Record<string, string> = {
    booked: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    pnr_created: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    awaiting_ticket: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    ticketed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    cancel_requested: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    cancel_failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    cancelled: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-400',
    refund_pending: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    refund_failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    refunded: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
    cancelled_provider_missing: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-400',
};

const flightStatusLabels: Record<string, string> = {
    booked: 'Processing',
    pnr_created: 'Booked',
    awaiting_ticket: 'Ticketing',
    ticketed: 'Confirmed',
    failed: 'Failed',
    cancel_requested: 'Cancelling…',
    cancel_failed: 'Cancel Failed',
    cancelled: 'Cancelled',
    refund_pending: 'Refund Pending',
    refund_failed: 'Refund Failed',
    refunded: 'Refunded',
    cancelled_provider_missing: 'Cancelled',
};

// Statuses that allow initiating (or retrying) a cancellation request
const CANCELLABLE_STATUSES = new Set(['confirmed', 'ticketed', 'booked', 'pnr_created', 'cancel_failed', 'refund_failed']);

// ─── Cancel Confirmation Modal ───────────────────────────────────────

interface CancelModalProps {
    booking: FlightBookingRecord;
    onConfirm: () => void;
    onClose: () => void;
    isLoading: boolean;
    error: string | null;
}

function CancelModal({ booking, onConfirm, onClose, isLoading, error }: CancelModalProps) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <div
                className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 max-w-md w-full p-6 animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-slate-900 dark:text-white">Cancel Booking?</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">PNR: {booking.pnr}</p>
                    </div>
                </div>

                {/* Policy note */}
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-4 text-xs text-amber-900 dark:text-amber-400 space-y-2">
                    <p className="font-semibold text-amber-800 dark:text-amber-500">Refund Policy Reminder:</p>
                    <ul className="list-disc list-inside space-y-1 text-amber-700 dark:text-amber-400/90">
                        {booking.fare_policy?.isRefundable === false ? (
                            <>
                                <li className="font-bold text-red-600 dark:text-red-400">This ticket is strictly non-refundable.</li>
                                <li>You will receive $0 back if you cancel.</li>
                            </>
                        ) : (
                            <>
                                <li>Refund eligibility and amounts are strictly determined by the airline's fare rules.</li>
                                {booking.fare_policy?.refundPenaltyAmount ? (
                                    <li>Estimated airline penalty: {formatCurrency(booking.fare_policy.refundPenaltyAmount, booking.fare_policy.refundPenaltyCurrency || booking.currency || 'USD')}</li>
                                ) : (
                                    <li>Cancellation penalties set by the airline will be deducted.</li>
                                )}
                            </>
                        )}
                        <li>If a refund is issued, it typically takes 5–10 business days.</li>
                        <li className="font-semibold pt-1 text-amber-800 dark:text-amber-500">This action cannot be undone.</li>
                    </ul>
                </div>

                {error && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4 text-xs text-red-700 dark:text-red-400">
                        {error}
                    </div>
                )}

                {/* Buttons */}
                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                    >
                        Keep Booking
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isLoading}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Cancelling…
                            </>
                        ) : (
                            'Yes, Cancel Booking'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main Component ──────────────────────────────────────────────────

export default function FlightBookingCard({ booking, onCancelled }: FlightBookingCardProps) {
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const [cancelError, setCancelError] = useState<string | null>(null);
    const [localStatus, setLocalStatus] = useState<FlightBookingRecord['status']>(booking.status);

    const segments = booking.flight_segments || [];
    const firstSegment = segments[0];
    const lastSegment = segments[segments.length - 1];

    const isUpcoming = firstSegment && new Date(firstSegment.departure) > new Date();
    const isPast = lastSegment && new Date(lastSegment.arrival) < new Date();
    const canCancel = CANCELLABLE_STATUSES.has(localStatus) && isUpcoming;

    let tripType = 'One-way';
    let mainDestination = lastSegment?.destination;
    const origin = firstSegment?.origin;

    if (booking.trip_type) {
        const map: Record<string, string> = {
            'one-way': 'One-way', 'round-trip': 'Round-trip', 'multi-city': 'Multi-city',
        };
        tripType = map[booking.trip_type] ?? 'One-way';

        if (booking.trip_type === 'round-trip' && segments.length > 1 && origin) {
            let maxLayover = -1;
            let turnAroundSegment = segments[0];
            for (let i = 0; i < segments.length - 1; i++) {
                const layover = new Date(segments[i + 1].departure).getTime() - new Date(segments[i].arrival).getTime();
                if (layover > maxLayover) { maxLayover = layover; turnAroundSegment = segments[i]; }
            }
            mainDestination = turnAroundSegment?.destination || mainDestination;
        }
    } else if (segments.length > 1 && origin && lastSegment) {
        if (origin === lastSegment.destination) {
            tripType = 'Round-trip';
            let maxLayover = -1;
            let turnAroundSegment = segments[0];
            for (let i = 0; i < segments.length - 1; i++) {
                const layover = new Date(segments[i + 1].departure).getTime() - new Date(segments[i].arrival).getTime();
                if (layover > maxLayover) { maxLayover = layover; turnAroundSegment = segments[i]; }
            }
            mainDestination = turnAroundSegment?.destination || mainDestination;
        } else {
            let hasLongLayoverOrGap = false;
            for (let i = 0; i < segments.length - 1; i++) {
                if (segments[i].destination !== segments[i + 1].origin) { hasLongLayoverOrGap = true; break; }
                const layover = new Date(segments[i + 1].departure).getTime() - new Date(segments[i].arrival).getTime();
                if (layover > 24 * 60 * 60 * 1000) { hasLongLayoverOrGap = true; break; }
            }
            if (hasLongLayoverOrGap) tripType = 'Multi-city';
        }
    }

    const fmtDate = (iso: string) =>
        formatDate(new Date(iso), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }, 'en-US');
    const fmtTime = (iso: string) =>
        formatDate(new Date(iso), { hour: '2-digit', minute: '2-digit', hour12: false }, 'en-US').split(', ')[1]
        || new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

    // ── Cancel handler ──────────────────────────────────────────────
    const handleCancelConfirm = async () => {
        setIsCancelling(true);
        setCancelError(null);
        try {
            const res = await fetch('/api/flights/cancel-booking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookingId: booking.id }),
            });
            const data = await res.json();

            if (!res.ok || !data.success) {
                setCancelError(data.error || 'Cancellation failed. Please contact support.');
                return;
            }

            setLocalStatus(data.status as FlightBookingRecord['status']); // 'refunded' or 'refund_pending' or 'refund_failed'
            setShowCancelModal(false);
            onCancelled?.(booking.id);
        } catch {
            setCancelError('Network error. Please try again.');
        } finally {
            setIsCancelling(false);
        }
    };

    // Helper to render the right side state chip
    const renderStateChip = () => {
        if (localStatus === 'cancel_requested') {
            return (
                <span className="inline-flex items-center gap-1 text-[10px] text-orange-600 dark:text-orange-400 font-medium whitespace-nowrap">
                    <Loader2 className="w-3 h-3 animate-spin shrink-0" /> Cancelling…
                </span>
            );
        }
        if (localStatus === 'refund_pending') {
            return (
                <span className="inline-flex items-center gap-1 text-[10px] text-purple-600 dark:text-purple-400 font-medium whitespace-nowrap">
                    <RefreshCw className="w-3 h-3 shrink-0" /> Refund processing
                </span>
            );
        }
        if (localStatus === 'refunded') {
            return (
                <span className="inline-flex items-center gap-1 text-[10px] text-teal-600 dark:text-teal-400 font-medium whitespace-nowrap">
                    <CheckCircle className="w-3 h-3 shrink-0" /> Refunded
                </span>
            );
        }
        if (localStatus === 'refund_failed') {
            return (
                <span className="inline-flex items-center gap-1 text-[10px] text-red-600 dark:text-red-400 font-medium whitespace-nowrap">
                    <XCircle className="w-3 h-3 shrink-0" /> Refund Failed
                </span>
            );
        }
        if (localStatus === 'cancel_failed') {
            return (
                <span className="inline-flex items-center gap-1 text-[10px] text-red-600 dark:text-red-400 font-medium whitespace-nowrap">
                    <XCircle className="w-3 h-3 shrink-0" /> Cancel failed — retry below
                </span>
            );
        }
        if (isUpcoming && localStatus === 'ticketed') {
            return (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium whitespace-nowrap">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shrink-0" /> Upcoming Flight
                </span>
            );
        }
        if (localStatus === 'awaiting_ticket') {
            return (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-medium whitespace-nowrap">
                    <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse shrink-0" /> Awaiting Confirmation
                </span>
            );
        }
        if (isPast && localStatus === 'ticketed') {
            return <span className="text-[10px] text-slate-400 whitespace-nowrap">Flight completed</span>;
        }
        if (localStatus === 'cancelled' || localStatus === 'cancelled_provider_missing') {
            return (
                <div className="flex flex-col items-end">
                    <span className="text-[10px] text-red-500 dark:text-red-400 whitespace-nowrap">Cancelled</span>
                    {localStatus === 'cancelled_provider_missing' && (
                        <span className="text-[8px] text-slate-400 whitespace-nowrap mt-0.5">Supplier record not found</span>
                    )}
                </div>
            );
        }
        return null;
    };

    return (
        <>
            {/* ── Cancel Modal ── */}
            {showCancelModal && (
                <CancelModal
                    booking={booking}
                    onConfirm={handleCancelConfirm}
                    onClose={() => { setShowCancelModal(false); setCancelError(null); }}
                    isLoading={isCancelling}
                    error={cancelError}
                />
            )}

            <div className="bg-white dark:bg-slate-900 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all group cursor-default">

                {/* ── MOBILE layout ── */}
                <div className="flex flex-row md:hidden min-h-[96px]">
                    {/* Visual Header */}
                    <div className="relative w-24 min-h-[96px] flex-shrink-0 bg-white dark:bg-slate-800 flex flex-col items-center justify-center rounded-l-lg border-r border-slate-100 dark:border-slate-700">
                        {/* Airline Logo */}
                        <div className="w-16 h-16 flex items-center justify-center mb-1">
                            <img
                                src={`https://images.kiwi.com/airlines/64/${firstSegment?.airline}.png`}
                                alt={firstSegment?.airline ?? ''}
                                className="w-16 h-16 object-contain"
                                onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    (e.currentTarget.nextSibling as HTMLElement)?.style.removeProperty('display');
                                }}
                            />
                            <span className="hidden text-[clamp(0.6rem,1.5vw,0.7rem)] font-bold text-slate-900 dark:text-white uppercase">
                                {firstSegment?.airline}
                            </span>
                        </div>
                        <div className="absolute top-1 left-1">
                            <span className={`text-[clamp(0.5rem,1.5vw,0.5625rem)] font-semibold px-1.5 py-0.5 rounded shadow ${flightStatusColors[localStatus] || flightStatusColors.booked}`}>
                                {flightStatusLabels[localStatus] || 'Unknown'}
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
                        <div className="mt-auto flex items-center justify-between gap-2">
                            <span className="text-[clamp(0.875rem,2.5vw,1rem)] font-bold text-slate-900 dark:text-white">
                                {formatCurrency(booking.total_price, 'USD')}
                            </span>
                            {canCancel && (
                                <button
                                    onClick={() => setShowCancelModal(true)}
                                    className="text-[10px] font-medium text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 border border-red-200 dark:border-red-800 rounded px-1.5 py-0.5 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
                                >
                                    Cancel
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── DESKTOP layout ── */}
                <div className="hidden md:flex flex-row min-h-[140px]">
                    {/* Visual Header */}
                    <div className="relative w-36 lg:w-44 flex-shrink-0 bg-white dark:bg-slate-800 flex flex-col items-center justify-center rounded-l-lg border-r border-slate-100 dark:border-slate-700 transition-colors overflow-hidden">
                        {/* Status badge — sits on top of the logo */}
                        <div className="absolute top-1.5 left-1.5 z-20">
                            <span className={`text-[clamp(0.5625rem,1.5vw,0.625rem)] font-semibold px-1.5 py-0.5 rounded shadow ${flightStatusColors[localStatus] || flightStatusColors.booked}`}>
                                {flightStatusLabels[localStatus] || 'Unknown'}
                            </span>
                        </div>
                        {/* Logo fills entire panel */}
                        <div className="absolute inset-0 flex items-center justify-center p-4">
                            <img
                                src={`https://images.kiwi.com/airlines/64/${firstSegment?.airline}.png`}
                                alt={firstSegment?.airline ?? ''}
                                className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-300"
                                onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    (e.currentTarget.nextSibling as HTMLElement)?.style.removeProperty('display');
                                }}
                            />
                            <span className="hidden text-2xl font-bold text-slate-900 dark:text-white uppercase">
                                {firstSegment?.airline}
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
                            <div className="flex items-center gap-1.5">
                                <span className="text-indigo-500 font-bold px-1 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/30 text-[9px] uppercase border border-indigo-100 dark:border-indigo-800 shrink-0">PNR</span>
                                <span className="font-mono font-medium">{booking.pnr}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5 text-green-500 shrink-0" />
                                <span>{booking.passengers?.length || 0} passenger{(booking.passengers?.length || 0) !== 1 && 's'}</span>
                            </div>
                            {segments.length > 0 && (
                                <div className="flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                                    <span>{segments.length === 1 ? 'Nonstop' : `${segments.length - 1} stop(s)`}</span>
                                </div>
                            )}
                        </div>

                        {/* eTickets */}
                        <div className="mt-auto">
                            {localStatus === 'ticketed' && booking.passengers?.some(p => p.ticket_number) && (
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
                    <div className="flex flex-col items-end justify-between w-[140px] p-3 border-l border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                        <div className="text-right w-full">
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">Total paid</div>
                            <span className="text-[clamp(0.875rem,2.5vw,1rem)] font-bold text-slate-900 dark:text-white">
                                {formatCurrency(booking.total_price, 'USD')}
                            </span>
                        </div>

                        <div className="flex flex-col items-end gap-2 w-full mt-2">
                            {(localStatus === 'cancelled' || localStatus === 'refunded' || localStatus === 'refund_pending') && booking.refund_amount !== undefined && (
                                <div className="text-right mt-1 p-2 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 w-full">
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400">Total Refund</div>
                                    <div className="text-xs font-bold text-green-600 dark:text-green-400">
                                        {formatCurrency(booking.refund_amount, booking.refund_currency || 'USD')}
                                    </div>
                                    {(booking.refund_penalty_amount ?? 0) > 0 && (
                                        <div className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">
                                            Penalty applied: {formatCurrency(booking.refund_penalty_amount!, booking.refund_currency || 'USD')}
                                        </div>
                                    )}
                                </div>
                            )}

                            {(localStatus === 'cancel_failed' || localStatus === 'refund_failed') ? (
                                /* ── Cancel/Refund Failed: prominent retry block ── */
                                <div className="w-full rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-2 space-y-1.5">
                                    <div className="flex items-center gap-1 text-[10px] font-semibold text-red-600 dark:text-red-400">
                                        <XCircle className="w-3 h-3 shrink-0" />
                                        {localStatus === 'cancel_failed' ? 'Cancellation failed' : 'Refund failed'}
                                    </div>
                                    <button
                                        onClick={() => setShowCancelModal(true)}
                                        className="w-full text-[10px] font-semibold bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white rounded px-2 py-1.5 transition-colors flex items-center justify-center gap-1"
                                    >
                                        <RotateCcw className="w-3 h-3" />
                                        Retry
                                    </button>
                                </div>
                            ) : (
                                <>
                                    {renderStateChip()}
                                    {/* Cancel button — only for upcoming, cancellable bookings (non-failed) */}
                                    {canCancel && !['cancel_failed', 'refund_failed'].includes(localStatus as string) && (
                                        <button
                                            onClick={() => setShowCancelModal(true)}
                                            className="w-full text-[10px] font-medium text-red-500 dark:text-red-400 hover:text-white border border-red-200 dark:border-red-800 hover:bg-red-500 dark:hover:bg-red-600 rounded-lg px-2 py-1.5 transition-all duration-200 flex items-center justify-center gap-1"
                                        >
                                            <RotateCcw className="w-3 h-3" />
                                            Cancel Booking
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
