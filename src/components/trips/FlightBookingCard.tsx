"use client";

import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Users, CheckCircle, XCircle, AlertTriangle, Loader2, RefreshCw, RotateCcw, ChevronDown, ChevronUp, Plane, Receipt, ArrowLeftRight } from 'lucide-react';
import type { FlightBookingRecord } from '@/services/booking.service';
import { formatDate, formatCurrency } from '@/lib/utils';
import { convertCurrency } from '@/lib/currency';
import { useUserCurrency } from '@/stores/searchStore';

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
    cancel_requested: 'Cancellation Stuck',
    cancel_failed: 'Cancel Failed',
    cancelled: 'Cancelled',
    refund_pending: 'Refund Pending',
    refund_failed: 'Refund Failed',
    refunded: 'Refunded',
    cancelled_provider_missing: 'Cancelled',
};

// Statuses that allow initiating (or retrying) a cancellation request
const CANCELLABLE_STATUSES = new Set(['confirmed', 'ticketed', 'booked', 'pnr_created', 'awaiting_ticket', 'cancel_failed', 'refund_failed', 'cancel_requested']);

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
    const [showTripDetails, setShowTripDetails] = useState(false);
    const [tripDetails, setTripDetails] = useState<any>(null);
    const [loadingTripDetails, setLoadingTripDetails] = useState(false);
    const [tripDetailsError, setTripDetailsError] = useState<string | null>(null);
    const [noteText, setNoteText] = useState('');
    const [submittingNote, setSubmittingNote] = useState(false);
    const [noteSuccess, setNoteSuccess] = useState(false);
    const [noteError, setNoteError] = useState<string | null>(null);
    const [existingNotes, setExistingNotes] = useState<{ note: string; created_at: string }[]>([]);
    // Ticket Display state — keyed by ticketNumber
    const [ticketDisplayData, setTicketDisplayData] = useState<Record<string, any>>({});
    const [loadingTicketDisplay, setLoadingTicketDisplay] = useState<Record<string, boolean>>({});
    const [showTicketDisplay, setShowTicketDisplay] = useState(false);

    const [showVoidQuote, setShowVoidQuote] = useState(false);
    const [voidQuoteData, setVoidQuoteData] = useState<any>(null);
    const [loadingVoidQuote, setLoadingVoidQuote] = useState(false);
    const [voidQuoteError, setVoidQuoteError] = useState<string | null>(null);
    const [confirmingVoid, setConfirmingVoid] = useState(false);
    const [voidResult, setVoidResult] = useState<any>(null);
    const [voidError, setVoidError] = useState<string | null>(null);
    // Refund Quote state
    const [showRefundQuote, setShowRefundQuote] = useState(false);
    const [refundStep, setRefundStep] = useState<'idle' | 'quoting' | 'got' | 'accepting' | 'accepted'>('idle');
    const [refundPtrId, setRefundPtrId] = useState<string | null>(null);
    const [refundPassengers, setRefundPassengers] = useState<any[]>([]);
    const [refundQuoteData, setRefundQuoteData] = useState<any>(null);
    const [refundDetails, setRefundDetails] = useState<any[]>([]);
    const [refundError, setRefundError] = useState<string | null>(null);
    // Reissue (date/flight change) state
    const [showReissue, setShowReissue] = useState(false);
    const [reissueStep, setReissueStep] = useState<'idle'|'quoting'|'got'|'accepting'|'accepted'>('idle');
    const [reissueQuoteData, setReissueQuoteData] = useState<any>(null);
    const [reissueError, setReissueError] = useState<string | null>(null);
    const [reissuePtrId, setReissuePtrId] = useState<number | null>(null);
    const [reissuePassengers, setReissuePassengers] = useState<any[]>([]);
    const [reissueNewSegments, setReissueNewSegments] = useState<{
        originLocationCode: string;
        destinationLocationCode: string;
        departureDate: string;     // "YYYY-MM-DD" — Mystifly wants date only
        cabinPreference: string;   // "Y"=Economy "C"=Business "F"=First
        flightNumber: number;
        airlineCode: string;
        label: string;
    }[]>([]);
    const [mounted, setMounted] = useState(false);
    const [fareEligibility, setFareEligibility] = useState<{ isVoidable: boolean; isRefundable: boolean; isChangeable?: boolean } | null>(null);
    const [loadingEligibility, setLoadingEligibility] = useState(false);
    useEffect(() => setMounted(true), []);

    const isMystifly = booking.provider === 'mystifly_v2';
    const isDuffel = booking.provider === 'duffel';

    // For Duffel: read fare_policy stored on the booking — no API call needed
    useEffect(() => {
        if (!isDuffel) return;
        const fp = (booking as any).fare_policy;
        if (!fp) return;
        setFareEligibility({
            isVoidable: false, // Duffel has no void concept
            isRefundable: fp.isRefundable === true,
            isChangeable: fp.isChangeable === true,
        });
    }, [isDuffel, (booking as any).fare_policy]); // eslint-disable-line react-hooks/exhaustive-deps

    // For Mystifly: derive void/refund eligibility from TripDetails whenever it loads
    useEffect(() => {
        if (!tripDetails) return;
        const ptcBreakdowns: any[] = tripDetails.TripDetailsPTC_FareBreakdowns ?? [];
        const fare = ptcBreakdowns[0];
        if (!fare) return;
        const isVoidable = String(fare.AirVoidCharges?.IsVoidable ?? '').toLowerCase() === 'yes';
        const isRefundable = String(fare.AirRefundCharges?.IsRefundableBeforeDeparture ?? '').toLowerCase() === 'yes';
        setFareEligibility({ isVoidable, isRefundable });
    }, [tripDetails]);

    // Close void/refund panels if eligibility comes back as ineligible
    useEffect(() => {
        if (!fareEligibility) return;
        if (!fareEligibility.isVoidable) { setShowVoidQuote(false); setVoidQuoteData(null); setVoidQuoteError(null); }
        if (!fareEligibility.isRefundable) { setShowRefundQuote(false); setRefundStep('idle'); setRefundError(null); }
    }, [fareEligibility]);

    // Silently auto-fetch TripDetails for ticketed Mystifly bookings to check eligibility
    useEffect(() => {
        if (localStatus !== 'ticketed' || !booking.pnr || !isMystifly || tripDetails || loadingEligibility) return;
        let cancelled = false;
        setLoadingEligibility(true);
        fetch('/api/flights/trip-details', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uniqueId: booking.pnr }),
        })
            .then(r => r.json())
            .then(data => { if (!cancelled && data.success) setTripDetails(data.travelItinerary); })
            .catch(() => {})
            .finally(() => { if (!cancelled) setLoadingEligibility(false); });
        return () => { cancelled = true; };
    }, [localStatus, booking.pnr, booking.provider]); // eslint-disable-line react-hooks/exhaustive-deps
    const userCurrency = useUserCurrency();
    const bookingCurrency = booking.currency || 'USD';
    const convertPrice = (amount: number, fromCurrency = bookingCurrency) =>
        mounted ? Math.round(convertCurrency(amount, fromCurrency, userCurrency)) : amount;
    const displayCurrency = mounted ? userCurrency : bookingCurrency;

    const segments = booking.flight_segments || [];
    const firstSegment = segments[0];
    const lastSegment = segments[segments.length - 1];

    const isUpcoming = firstSegment && new Date(firstSegment.departure) > new Date();
    const isPast = lastSegment && new Date(lastSegment.arrival) < new Date();

    // Check if last cancel attempt required manual intervention (ERCBK007 — ticketed booking)
    const lastLog = booking.cancellation_log?.[booking.cancellation_log.length - 1];
    const requiresManualCancellation = lastLog?.requiresManualCancellation === true;

    const canCancel = CANCELLABLE_STATUSES.has(localStatus) && !requiresManualCancellation;

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
                if (data.requiresManualCancellation) {
                    const isMystifly = booking.provider === 'mystifly_v2';
                    setCancelError(
                        isMystifly
                            ? 'This ticketed booking cannot be cancelled via API. Please email crm@myfarebox.com to request cancellation.'
                            : 'This booking cannot be cancelled online. Please contact us at crm@cheapestgo.com to request a manual cancellation.'
                    );
                    setShowCancelModal(false);
                } else {
                    setCancelError(data.error || 'Cancellation failed. Please contact support.');
                }
                setLocalStatus('cancel_failed');
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

    // ── Fetch existing notes ────────────────────────────────────────
    const fetchNotes = async () => {
        if (!booking.id) return;
        try {
            const res = await fetch(`/api/flights/booking-notes?bookingId=${booking.id}`);
            const data = await res.json();
            if (data.success) setExistingNotes(data.notes);
        } catch {
            // silently ignore
        }
    };

    // ── Trip Details handler ────────────────────────────────────────
    const handleViewTripDetails = async () => {
        if (showTripDetails) { setShowTripDetails(false); return; }
        setShowTripDetails(true);
        fetchNotes();
        if (tripDetails) return; // already loaded
        setLoadingTripDetails(true);
        setTripDetailsError(null);
        try {
            const res = await fetch('/api/flights/trip-details', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uniqueId: booking.pnr }),
            });
            const data = await res.json();
            if (data.success) {
                setTripDetails(data.travelItinerary);
            } else {
                setTripDetailsError(data.error || 'Could not load trip details');
            }
        } catch {
            setTripDetailsError('Network error. Please try again.');
        } finally {
            setLoadingTripDetails(false);
        }
    };

    // ── Ticket Display handler ──────────────────────────────────────
    const handleTicketDisplay = async (ticketNumber: string) => {
        if (!booking.pnr || !ticketNumber) return;
        if (ticketDisplayData[ticketNumber]) {
            // toggle off if already loaded
            setShowTicketDisplay(prev => !prev);
            return;
        }
        setShowTicketDisplay(true);
        setLoadingTicketDisplay(prev => ({ ...prev, [ticketNumber]: true }));
        try {
            const res = await fetch('/api/flights/ticket-display', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mfRef: booking.pnr, ticketNumber }),
            });
            const data = await res.json();
            if (data.success) {
                setTicketDisplayData(prev => ({ ...prev, [ticketNumber]: data.ticketData }));
            } else {
                setTicketDisplayData(prev => ({ ...prev, [ticketNumber]: { error: data.error || 'Could not load ticket details' } }));
            }
        } catch {
            setTicketDisplayData(prev => ({ ...prev, [ticketNumber]: { error: 'Network error. Please try again.' } }));
        } finally {
            setLoadingTicketDisplay(prev => ({ ...prev, [ticketNumber]: false }));
        }
    };

    // ── Booking Note handler ────────────────────────────────────────
    const handleAddNote = async () => {
        if (!noteText.trim()) return;
        setSubmittingNote(true);
        setNoteError(null);
        setNoteSuccess(false);
        try {
            const res = await fetch('/api/flights/booking-note', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uniqueId: booking.pnr, notes: [noteText.trim()], bookingId: booking.id }),
            });
            const data = await res.json();
            if (data.success) {
                setNoteSuccess(true);
                setNoteText('');
                fetchNotes();
            } else {
                setNoteError(data.error || 'Could not add note');
            }
        } catch {
            setNoteError('Network error. Please try again.');
        } finally {
            setSubmittingNote(false);
        }
    };

    // ── Void Quote handler ──────────────────────────────────────────
    const handleVoidQuote = async () => {
        if (showVoidQuote) { setShowVoidQuote(false); return; }
        setShowVoidQuote(true);
        if (voidQuoteData) return; // already loaded
        setLoadingVoidQuote(true);
        setVoidQuoteError(null);
        try {
            // Auto-fetch tripDetails if not loaded yet (needed for eTicket numbers)
            let resolvedTripDetails = tripDetails;
            if (!resolvedTripDetails) {
                const detailsRes = await fetch('/api/flights/trip-details', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uniqueId: booking.pnr }),
                });
                const detailsData = await detailsRes.json();
                if (detailsData.success) {
                    resolvedTripDetails = detailsData.travelItinerary;
                    setTripDetails(resolvedTripDetails);
                } else {
                    setVoidQuoteError(detailsData.error || 'Could not load trip details to get e-ticket numbers.');
                    setLoadingVoidQuote(false);
                    return;
                }
            }

            // Extract passengers + eTickets — handle both new and legacy API structures
            let passengers: any[] = [];

            // New structure: PassengerInfos[].Passenger.PaxName + ETickets[]
            const passengerInfos: any[] = resolvedTripDetails?.PassengerInfos ?? [];
            if (passengerInfos.length > 0) {
                passengers = passengerInfos.map((p: any, idx: number) => {
                    const pax = p.Passenger ?? p;
                    const name = pax.PaxName ?? pax;
                    // Fall back to DB ticket_number if Mystifly hasn't populated ETickets yet
                    const eTicket = (p.ETickets ?? [])[0]?.ETicketNumber
                        || booking.passengers?.[idx]?.ticket_number
                        || '';
                    return {
                        firstName: name.PassengerFirstName ?? '',
                        lastName: name.PassengerLastName ?? '',
                        title: name.PassengerTitle ?? 'MR',
                        eTicket,
                        passengerType: pax.PassengerType ?? 'ADT',
                    };
                });
            } else {
                // Legacy structure: ItineraryInfo.CustomerInfos.CustomerInfo[]
                const itinInfo = resolvedTripDetails?.ItineraryInfo ?? resolvedTripDetails;
                const customers: any[] = itinInfo?.CustomerInfos?.CustomerInfo ?? [];
                passengers = customers.map((c: any, idx: number) => ({
                    firstName: c.PassengerFirstName ?? '',
                    lastName: c.PassengerLastName ?? '',
                    title: c.PassengerTitle ?? 'MR',
                    eTicket: c.ETicketNumber || booking.passengers?.[idx]?.ticket_number || '',
                    passengerType: c.PassengerType ?? 'ADT',
                }));
            }

            // Last resort: build entirely from DB passengers (e.g. TripDetails not yet populated by Mystifly)
            if ((passengers.length === 0 || !passengers[0].eTicket) && booking.passengers?.some(p => p.ticket_number)) {
                passengers = (booking.passengers ?? []).map(p => ({
                    firstName: p.first_name,
                    lastName: p.last_name,
                    title: 'MR',
                    eTicket: p.ticket_number ?? '',
                    passengerType: p.type ?? 'ADT',
                }));
            }

            if (passengers.length === 0 || !passengers[0].eTicket) {
                setVoidQuoteError('E-ticket numbers not found. This booking may not be ticketed yet.');
                setLoadingVoidQuote(false);
                return;
            }
            const originDestinations = (booking.flight_segments ?? []).map(s => ({
                originLocationCode: s.origin,
                destinationLocationCode: s.destination,
                cabinPreference: '',
                departureDateTime: s.departure,
                flightNumber: parseInt(s.flight_number?.replace(/\D/g, '') || '0', 10),
                airlineCode: s.airline,
            }));

            const res = await fetch('/api/flights/void-quote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mfRef: booking.pnr, passengers, originDestinations }),
            });
            const data = await res.json();
            if (data.success) {
                setVoidQuoteData(data);
            } else {
                setVoidQuoteError(data.error || 'Could not get void quote');
            }
        } catch {
            setVoidQuoteError('Network error. Please try again.');
        } finally {
            setLoadingVoidQuote(false);
        }
    };

    const handleConfirmVoid = async () => {
        if (!voidQuoteData) return;
        setConfirmingVoid(true);
        setVoidError(null);
        try {
            // Rebuild passengers from voidQuoteData or tripDetails
            const passengerInfos: any[] = tripDetails?.PassengerInfos ?? [];
            let passengers: any[] = passengerInfos.map((p: any) => {
                const pax = p.Passenger ?? p;
                const name = pax.PaxName ?? pax;
                return {
                    firstName: name.PassengerFirstName ?? '',
                    lastName: name.PassengerLastName ?? '',
                    title: name.PassengerTitle ?? 'MR',
                    eTicket: (p.ETickets ?? [])[0]?.ETicketNumber ?? '',
                    passengerType: pax.PassengerType ?? 'ADT',
                };
            });
            // Fallback: use voidQuotes passenger data
            if (passengers.length === 0 && voidQuoteData.voidQuotes?.length > 0) {
                passengers = voidQuoteData.voidQuotes.map((q: any) => ({
                    firstName: q.FirstName ?? '',
                    lastName: q.LastName ?? '',
                    title: q.Title ?? 'MR',
                    eTicket: q.ETicketNumber ?? '',
                    passengerType: q.PassengerType ?? 'ADT',
                }));
            }
            const originDestinations = (booking.flight_segments ?? []).map(s => ({
                originLocationCode: s.origin,
                destinationLocationCode: s.destination,
                cabinPreference: '',
                departureDateTime: s.departure,
                flightNumber: parseInt(s.flight_number?.replace(/\D/g, '') || '0', 10),
                airlineCode: s.airline,
            }));

            const res = await fetch('/api/flights/void', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mfRef: booking.pnr,
                    passengers,
                    bookingId: booking.id,
                    ptrId: voidQuoteData.ptrId ?? 0,
                    originDestinations,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setVoidResult(data);
                setLocalStatus('cancelled');
            } else {
                setVoidError(data.error || 'Void failed. Please try again.');
            }
        } catch {
            setVoidError('Network error. Please try again.');
        } finally {
            setConfirmingVoid(false);
        }
    };

    const handleRefundQuote = async () => {
        if (showRefundQuote) { setShowRefundQuote(false); return; }
        setShowRefundQuote(true);
        if (refundStep !== 'idle') return;

        setRefundStep('quoting');
        setRefundError(null);
        try {
            // Ensure we have trip details for passenger eTickets
            let resolvedTripDetails = tripDetails;
            if (!resolvedTripDetails) {
                const detailsRes = await fetch('/api/flights/trip-details', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uniqueId: booking.pnr }),
                });
                const detailsData = await detailsRes.json();
                if (detailsData.success) {
                    resolvedTripDetails = detailsData.travelItinerary;
                    setTripDetails(resolvedTripDetails);
                } else {
                    setRefundError('Could not load trip details.');
                    setRefundStep('idle');
                    return;
                }
            }

            const passengerInfos: any[] = resolvedTripDetails?.PassengerInfos ?? [];
            let passengers: any[] = passengerInfos.map((p: any, idx: number) => {
                const pax = p.Passenger ?? p;
                const name = pax.PaxName ?? pax;
                return {
                    firstName: name.PassengerFirstName ?? '',
                    lastName: name.PassengerLastName ?? '',
                    title: name.PassengerTitle ?? 'MR',
                    eTicket: (p.ETickets ?? [])[0]?.ETicketNumber
                        || booking.passengers?.[idx]?.ticket_number
                        || '',
                    passengerType: pax.PassengerType ?? 'ADT',
                };
            });

            // Last resort: build from DB passengers if TripDetails has no ETickets yet
            if ((passengers.length === 0 || !passengers[0].eTicket) && booking.passengers?.some(p => p.ticket_number)) {
                passengers = (booking.passengers ?? []).map(p => ({
                    firstName: p.first_name,
                    lastName: p.last_name,
                    title: 'MR',
                    eTicket: p.ticket_number ?? '',
                    passengerType: p.type ?? 'ADT',
                }));
            }

            if (passengers.length === 0 || !passengers[0].eTicket) {
                setRefundError('E-ticket numbers not found.');
                setRefundStep('idle');
                return;
            }

            const originDestinations = (booking.flight_segments ?? []).map(s => ({
                originLocationCode: s.origin,
                destinationLocationCode: s.destination,
                cabinPreference: '',
                departureDateTime: s.departure,
                flightNumber: parseInt(s.flight_number?.replace(/\D/g, '') || '0', 10),
                airlineCode: s.airline,
            }));

            const res = await fetch('/api/flights/refund', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ step: 'quote', mfRef: booking.pnr, passengers, originDestinations }),
            });
            const data = await res.json();
            if (!data.success) { setRefundError(data.error || 'RefundQuote failed.'); setRefundStep('idle'); return; }

            setRefundPtrId(data.ptrId);
            setRefundPassengers(passengers);
            setRefundDetails(data.refundDetails ?? []);
            setRefundQuoteData(data);
            setRefundStep('got');
        } catch {
            setRefundError('Network error. Please try again.');
            setRefundStep('idle');
        }
    };

    const handleAcceptRefund = async () => {
        if (!booking.pnr || !refundPassengers.length) return;
        setRefundStep('accepting');
        setRefundError(null);
        try {
            const res = await fetch('/api/flights/refund', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    step: 'execute',
                    mfRef: booking.pnr,
                    passengers: refundPassengers,
                    bookingId: booking.id,
                    ptrId: refundPtrId ?? 0,
                    originDestinations: (booking.flight_segments ?? []).map(s => ({
                        originLocationCode: s.origin,
                        destinationLocationCode: s.destination,
                        cabinPreference: '',
                        departureDateTime: s.departure,
                        flightNumber: parseInt(s.flight_number?.replace(/\D/g, '') || '0', 10),
                        airlineCode: s.airline,
                    })),
                    refundDetails,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setRefundStep('accepted');
                setLocalStatus('cancelled');
            } else {
                setRefundError(data.error || 'Refund failed.');
                setRefundStep('got');
            }
        } catch {
            setRefundError('Network error. Please try again.');
            setRefundStep('got');
        }
    };

    // ── Reissue handlers ────────────────────────────────────────────
    const handleOpenReissue = () => {
        if (showReissue) { setShowReissue(false); return; }
        setShowReissue(true);
        setReissueStep('idle');
        setReissueError(null);
        setReissueQuoteData(null);
        // Pre-fill segment editors from existing booking segments
        // Group segments by itinerary_index — Mystifly wants one FlightOption per leg
        const allSegs = [...(booking.flight_segments ?? [])].sort(
            (a, b) => new Date(a.departure).getTime() - new Date(b.departure).getTime(),
        );
        const byItinerary = new Map<number, NonNullable<typeof booking.flight_segments>>();
        for (const s of allSegs) {
            const idx = s.itinerary_index ?? 0;
            if (!byItinerary.has(idx)) byItinerary.set(idx, []);
            byItinerary.get(idx)!.push(s);
        }
        // Fallback: if all segments share index 0 on a round-trip, split at midpoint
        if (byItinerary.size === 1 && booking.trip_type === 'round-trip' && allSegs.length >= 2) {
            const mid = Math.ceil(allSegs.length / 2);
            byItinerary.set(0, allSegs.slice(0, mid));
            byItinerary.set(1, allSegs.slice(mid));
        }
        const itinLabels = ['Outbound', 'Return', 'Leg 3', 'Leg 4'];
        const segs = Array.from(byItinerary.entries())
            .sort(([a], [b]) => a - b)
            .map(([itinIdx, segments]) => {
                const first = segments[0];
                const last = segments[segments.length - 1];
                return {
                    originLocationCode: first.origin,
                    destinationLocationCode: last.destination,
                    departureDate: first.departure
                        ? first.departure.replace('Z', '').replace(/\.\d+$/, '').slice(0, 10)
                        : '',
                    cabinPreference: 'Y',
                    flightNumber: 0,
                    airlineCode: first.airline || '',
                    label: itinLabels[itinIdx] ?? `Leg ${itinIdx + 1}`,
                };
            });
        setReissueNewSegments(segs);
    };

    const handleReissueQuote = async () => {
        setReissueStep('quoting');
        setReissueError(null);
        try {
            // Build passengers from TripDetails (eTickets required by Mystifly)
            let resolvedTripDetails = tripDetails;
            if (!resolvedTripDetails) {
                const r = await fetch('/api/flights/trip-details', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uniqueId: booking.pnr }),
                });
                const d = await r.json();
                if (d.success) { resolvedTripDetails = d.travelItinerary; setTripDetails(resolvedTripDetails); }
                else { setReissueError(d.error || 'Could not load trip details.'); setReissueStep('idle'); return; }
            }
            let passengers: any[] = (resolvedTripDetails?.PassengerInfos ?? []).map((p: any, idx: number) => {
                const pax = p.Passenger ?? p; const name = pax.PaxName ?? pax;
                return { firstName: name.PassengerFirstName ?? '', lastName: name.PassengerLastName ?? '',
                    title: name.PassengerTitle ?? 'MR',
                    eTicket: (p.ETickets ?? [])[0]?.ETicketNumber || booking.passengers?.[idx]?.ticket_number || '',
                    passengerType: pax.PassengerType ?? 'ADT' };
            });
            if (passengers.length === 0 && booking.passengers?.length) {
                passengers = booking.passengers.map(p => ({
                    firstName: p.first_name, lastName: p.last_name, title: 'MR',
                    eTicket: p.ticket_number ?? '', passengerType: p.type ?? 'ADT',
                }));
            }
            if (!passengers[0]?.eTicket) {
                setReissueError('E-ticket numbers not found. Booking may not be fully ticketed yet.');
                setReissueStep('idle'); return;
            }
            setReissuePassengers(passengers);

            const originDestinations = reissueNewSegments.map(s => ({
                originLocationCode: s.originLocationCode,
                destinationLocationCode: s.destinationLocationCode,
                cabinPreference: s.cabinPreference,
                departureDateTime: s.departureDate,
                flightNumber: s.flightNumber,
                airlineCode: s.airlineCode,
            }));
            const res = await fetch('/api/flights/reissue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ step: 'quote', mfRef: booking.pnr, passengers, originDestinations }),
            });
            const data = await res.json();
            if (data.success) {
                setReissueQuoteData(data);
                setReissuePtrId(data.ptrId ?? null);
                setReissueStep('got');
            } else {
                setReissueError(data.error || 'Could not get reissue quote.');
                setReissueStep('idle');
            }
        } catch {
            setReissueError('Network error. Please try again.');
            setReissueStep('idle');
        }
    };

    const handleConfirmReissue = async () => {
        setReissueStep('accepting');
        setReissueError(null);
        try {
            const originDestinations = reissueNewSegments.map(s => ({
                originLocationCode: s.originLocationCode,
                destinationLocationCode: s.destinationLocationCode,
                cabinPreference: s.cabinPreference,
                departureDateTime: s.departureDate,
                flightNumber: s.flightNumber,
                airlineCode: s.airlineCode,
            }));
            const res = await fetch('/api/flights/reissue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    step: 'execute', mfRef: booking.pnr,
                    passengers: reissuePassengers, ptrId: reissuePtrId ?? 0,
                    originDestinations, bookingId: booking.id,
                }),
            });
            const data = await res.json();
            if (data.success) { setReissueStep('accepted'); setLocalStatus('reissued' as any); }
            else { setReissueError(data.error || 'Reissue failed. Please try again.'); setReissueStep('got'); }
        } catch {
            setReissueError('Network error. Please try again.');
            setReissueStep('got');
        }
    };

    // Helper to render the right side state chip
    const renderStateChip = () => {
        if (localStatus === 'cancel_requested') {
            return (
                <span className="inline-flex items-center gap-1 text-[10px] text-orange-600 dark:text-orange-400 font-medium whitespace-nowrap">
                    <AlertTriangle className="w-3 h-3 shrink-0" /> Cancellation stuck — retry below
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
            return requiresManualCancellation ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-medium whitespace-nowrap">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    {booking.provider === 'mystifly_v2' ? 'Email crm@myfarebox.com to cancel' : 'Contact support to cancel'}
                </span>
            ) : (
                <span className="inline-flex items-center gap-1 text-[10px] text-red-600 dark:text-red-400 font-medium whitespace-nowrap">
                    <XCircle className="w-3 h-3 shrink-0" /> Cancel failed — retry below
                </span>
            );
        }
        if (isUpcoming && (localStatus === 'ticketed' || localStatus === 'awaiting_ticket')) {
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
                                {formatCurrency(convertPrice(booking.total_price), displayCurrency)}
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

                {/* ── Mystifly Trip Details + Void Quote toggles (mobile) ── */}
                {isMystifly && booking.pnr && (
                    <div className="md:hidden border-t border-slate-100 dark:border-slate-800">
                        <button
                            onClick={handleViewTripDetails}
                            className="w-full flex items-center justify-between px-2.5 py-2 text-[10px] text-indigo-600 dark:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                            <span className="flex items-center gap-1"><Plane className="w-3 h-3" /> Airline booking details</span>
                            {showTripDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                        {localStatus === 'ticketed' && (<>
                            {fareEligibility === null || fareEligibility.isVoidable ? (
                                <button
                                    onClick={handleVoidQuote}
                                    className="w-full flex items-center justify-between px-2.5 py-2 text-[10px] text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 border-t border-slate-100 dark:border-slate-800 transition-colors"
                                >
                                    <span className="flex items-center gap-1">
                                        {loadingVoidQuote ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                                        Void quote
                                    </span>
                                    {!loadingVoidQuote && (showVoidQuote ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                </button>
                            ) : (
                                <div className="flex items-center gap-1.5 px-2.5 py-2 text-[10px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800">
                                    <XCircle className="w-3 h-3 shrink-0" /> Void not available (airline policy)
                                </div>
                            )}
                            {fareEligibility === null || fareEligibility.isRefundable ? (
                                <button
                                    onClick={handleRefundQuote}
                                    className="w-full flex items-center justify-between px-2.5 py-2 text-[10px] text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 border-t border-slate-100 dark:border-slate-800 transition-colors"
                                >
                                    <span className="flex items-center gap-1">
                                        {['quoting', 'accepting'].includes(refundStep) ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                                        Refund quote
                                    </span>
                                    {!['quoting', 'accepting'].includes(refundStep) && (showRefundQuote ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                </button>
                            ) : (
                                <div className="flex items-center gap-1.5 px-2.5 py-2 text-[10px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800">
                                    <XCircle className="w-3 h-3 shrink-0" /> Refund not available (airline policy)
                                </div>
                            )}
                        </>)}
                    </div>
                )}

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
                            {segments.length > 0 && (() => {
                                // Group hops by itinerary_index (outbound=0, return=1, etc.)
                                // Stops per direction = hops in that direction - 1
                                const byItinerary = segments.reduce<Record<number, typeof segments>>((acc, seg) => {
                                    const idx = seg.itinerary_index ?? 0;
                                    (acc[idx] ??= []).push(seg);
                                    return acc;
                                }, {});
                                const itineraryKeys = Object.keys(byItinerary).map(Number).sort();
                                const stopLabels = itineraryKeys.map(k => {
                                    const count = byItinerary[k].length - 1;
                                    return count === 0 ? 'Nonstop' : `${count} stop${count > 1 ? 's' : ''}`;
                                });
                                return (
                                    <div className="flex items-center gap-1.5">
                                        <Clock className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                                        <span>{stopLabels.join(' / ')}</span>
                                    </div>
                                );
                            })()}
                        </div>

                        {/* eTickets + fare policy badges */}
                        <div className="mt-auto space-y-1.5">
                            {(localStatus === 'ticketed' || localStatus === 'awaiting_ticket') && booking.passengers?.some(p => p.ticket_number) && (
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

                            {/* Fare policy badges — shown once eligibility loads */}
                            {fareEligibility !== null && (
                                <div className="flex flex-wrap gap-1.5">
                                    {fareEligibility.isVoidable ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                            <CheckCircle className="w-3 h-3 shrink-0" /> Free cancellation
                                        </span>
                                    ) : fareEligibility.isRefundable ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                                            <RotateCcw className="w-3 h-3 shrink-0" /> Refundable
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400 border border-red-200 dark:border-red-800">
                                            <XCircle className="w-3 h-3 shrink-0" /> Non-refundable
                                        </span>
                                    )}
                                    {isDuffel && fareEligibility.isChangeable && (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
                                            <ArrowLeftRight className="w-3 h-3 shrink-0" /> Changeable
                                        </span>
                                    )}
                                </div>
                            )}
                            {loadingEligibility && (
                                <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                    <Loader2 className="w-3 h-3 animate-spin" /> Checking fare policy…
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right panel — status & price */}
                    <div className="flex flex-col items-end justify-between w-[140px] p-3 border-l border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 gap-2">
                        <div className="text-right w-full">
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">Total paid</div>
                            <span className="text-[clamp(0.875rem,2.5vw,1rem)] font-bold text-slate-900 dark:text-white">
                                {formatCurrency(convertPrice(booking.total_price), displayCurrency)}
                            </span>
                        </div>

                        <div className="flex flex-col items-end gap-2 w-full mt-2">
                            {(localStatus === 'cancelled' || localStatus === 'refunded' || localStatus === 'refund_pending') && booking.refund_amount !== undefined && (
                                <div className="text-right mt-1 p-2 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 w-full">
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400">Total Refund</div>
                                    <div className="text-xs font-bold text-green-600 dark:text-green-400">
                                        {formatCurrency(convertPrice(booking.refund_amount, booking.refund_currency || 'USD'), displayCurrency)}
                                    </div>
                                    {(booking.refund_penalty_amount ?? 0) > 0 && (
                                        <div className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">
                                            Penalty applied: {formatCurrency(convertPrice(booking.refund_penalty_amount!, booking.refund_currency || 'USD'), displayCurrency)}
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
                    {/* Airline details button — desktop */}
                    <div className="hidden md:flex flex-col gap-1.5">
                        {isMystifly && booking.pnr && (<>
                            <button
                                onClick={handleViewTripDetails}
                                className="flex w-full items-center justify-center gap-1 text-[10px] font-medium text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg px-2 py-1.5 transition-colors"
                            >
                                <Plane className="w-3 h-3" />
                                {showTripDetails ? 'Hide details' : 'Airline details'}
                                {showTripDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                            {localStatus === 'ticketed' && (<>
                                {fareEligibility === null || fareEligibility.isVoidable ? (
                                    <button
                                        onClick={handleVoidQuote}
                                        className="flex w-full items-center justify-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg px-2 py-1.5 transition-colors"
                                    >
                                        {loadingVoidQuote ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                                        {showVoidQuote ? 'Hide void quote' : 'Void quote'}
                                        {!loadingVoidQuote && (showVoidQuote ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                    </button>
                                ) : (
                                    <div className="flex w-full items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 cursor-default">
                                        <XCircle className="w-3 h-3 shrink-0" />
                                        <span>Void not available</span>
                                    </div>
                                )}
                                {fareEligibility === null || fareEligibility.isRefundable ? (
                                    <button
                                        onClick={handleRefundQuote}
                                        className="flex w-full items-center justify-center gap-1 text-[10px] font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg px-2 py-1.5 transition-colors"
                                    >
                                        {['quoting', 'accepting'].includes(refundStep) ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                                        {showRefundQuote ? 'Hide refund quote' : 'Refund quote'}
                                        {!['quoting', 'accepting'].includes(refundStep) && (showRefundQuote ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                    </button>
                                ) : (
                                    <div className="flex w-full items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 cursor-default">
                                        <XCircle className="w-3 h-3 shrink-0" />
                                        <span>Refund not available</span>
                                    </div>
                                )}
                            </>)}
                            {/* Reissue / Change Flight button — upcoming ticketed only */}
                            {isUpcoming && (
                                <button
                                    onClick={handleOpenReissue}
                                    className="flex w-full items-center justify-center gap-1 text-[10px] font-medium text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-lg px-2 py-1.5 transition-colors"
                                >
                                    <ArrowLeftRight className="w-3 h-3" />
                                    {showReissue ? 'Hide change flight' : 'Change flight'}
                                    {showReissue ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                </button>
                            )}
                        </>)}
                        <a
                            href={`/trips/invoice/${booking.id}?type=flight`}
                            className="flex w-full items-center justify-center gap-1 text-[10px] font-medium text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg px-2 py-1.5 transition-colors"
                        >
                            <Receipt className="w-3 h-3" />
                            Receipt
                        </a>
                    </div>
                    </div>
                </div>

                {/* ── Trip Details Panel (shared mobile + desktop) ── */}
                {showTripDetails && (
                    <div className="border-t border-slate-100 dark:border-slate-800 px-3 lg:px-5 py-3">
                        {loadingTripDetails && (
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading airline details…
                            </div>
                        )}
                        {tripDetailsError && (
                            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {tripDetailsError}
                            </div>
                        )}
                        {/* Existing Notes */}
                        {existingNotes.length > 0 && (
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 mb-2">
                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Booking Notes</p>
                                <div className="space-y-1.5">
                                    {existingNotes.map((n, i) => (
                                        <div key={i} className="flex items-start gap-2 text-xs bg-slate-50 dark:bg-slate-800/50 rounded-lg px-2.5 py-2 border border-slate-100 dark:border-slate-700">
                                            <CheckCircle className="w-3 h-3 text-indigo-400 shrink-0 mt-0.5" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-slate-700 dark:text-slate-300">{n.note}</p>
                                                <p className="text-[10px] text-slate-400 mt-0.5">{new Date(n.created_at).toLocaleString()}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Add Note */}
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Add Booking Note</p>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={noteText}
                                    onChange={e => { setNoteText(e.target.value); setNoteSuccess(false); setNoteError(null); }}
                                    onKeyDown={e => e.key === 'Enter' && handleAddNote()}
                                    placeholder="Enter a note for this booking…"
                                    className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                />
                                <button
                                    onClick={handleAddNote}
                                    disabled={submittingNote || !noteText.trim()}
                                    className="shrink-0 text-[10px] font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 flex items-center gap-1 transition-colors"
                                >
                                    {submittingNote ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                                </button>
                            </div>
                            {noteSuccess && <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Note added successfully.</p>}
                            {noteError && <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {noteError}</p>}
                        </div>

                        {tripDetails && !loadingTripDetails && (() => {
                            // New API structure: PassengerInfos[] + Itineraries[].ItineraryInfo.ReservationItems[]
                            const passengerInfos: any[] = tripDetails.PassengerInfos ?? [];
                            const reservationItems: any[] = (tripDetails.Itineraries ?? [])
                                .flatMap((it: any) => it?.ItineraryInfo?.ReservationItems ?? []);
                            const ptcBreakdowns: any[] = tripDetails.TripDetailsPTC_FareBreakdowns ?? [];
                            const totalFare = ptcBreakdowns[0]?.TripDetailsPassengerFare?.TotalFare;

                            // Legacy structure fallback
                            const itinInfo = tripDetails.ItineraryInfo ?? null;
                            const legacyCustomers: any[] = itinInfo?.CustomerInfos?.CustomerInfo ?? [];
                            const legacyItems: any[] = itinInfo?.ReservationItems?.Item ?? [];
                            const legacyPricing = itinInfo?.ItineraryPricing ?? tripDetails.ItineraryPricing;

                            const hasNewStructure = passengerInfos.length > 0 || reservationItems.length > 0;

                            return (
                                <div className="space-y-3 text-xs">
                                    {/* Passengers */}
                                    {hasNewStructure ? (
                                        passengerInfos.length > 0 && (
                                            <div>
                                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Passengers</p>
                                                <div className="space-y-2">
                                                    {passengerInfos.map((p: any, i: number) => {
                                                        const pax = p.Passenger ?? p;
                                                        const name = pax.PaxName ?? pax;
                                                        const eTicket = (p.ETickets ?? [])[0]?.ETicketNumber
                                                            || booking.passengers?.[i]?.ticket_number;
                                                        const tktData = eTicket ? ticketDisplayData[eTicket] : null;
                                                        const tktLoading = eTicket ? loadingTicketDisplay[eTicket] : false;
                                                        return (
                                                            <div key={i}>
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <span className="text-slate-700 dark:text-slate-300">
                                                                        {name.PassengerTitle} {name.PassengerFirstName} {name.PassengerLastName}
                                                                    </span>
                                                                    <div className="flex items-center gap-1.5">
                                                                        {eTicket && (
                                                                            <span className="font-mono text-[10px] bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                                                                                {eTicket}
                                                                            </span>
                                                                        )}
                                                                        {eTicket && (
                                                                            <button
                                                                                onClick={() => handleTicketDisplay(eTicket)}
                                                                                className="flex items-center gap-1 text-[10px] font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded px-1.5 py-0.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                                                                            >
                                                                                {tktLoading ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Receipt className="w-2.5 h-2.5" />}
                                                                                {tktData && !tktData.error ? 'Hide' : 'Ticket'}
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                {/* Ticket Display panel */}
                                                                {tktData && showTicketDisplay && !tktLoading && (
                                                                    <div className="mt-1.5 ml-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-[10px] space-y-1.5">
                                                                        {tktData.error ? (
                                                                            <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{tktData.error}</span>
                                                                        ) : (
                                                                            <>
                                                                                {tktData.GrandTotal && (
                                                                                    <div className="flex gap-2">
                                                                                        <span className="text-slate-500">Grand Total:</span>
                                                                                        <span className="font-semibold text-slate-800 dark:text-slate-200">{tktData.GrandTotal} {tktData.GrandTotalCurrency}</span>
                                                                                    </div>
                                                                                )}
                                                                                {tktData.TotalFare && (
                                                                                    <div className="flex gap-2">
                                                                                        <span className="text-slate-500">Total Fare:</span>
                                                                                        <span className="text-slate-700 dark:text-slate-300">{tktData.TotalFare} {tktData.TotalTaxCurrency}</span>
                                                                                    </div>
                                                                                )}
                                                                                {tktData.FareCalculationLine && (
                                                                                    <div>
                                                                                        <span className="text-slate-500 block mb-0.5">Fare Calc:</span>
                                                                                        <span className="font-mono text-slate-600 dark:text-slate-400 break-all">{tktData.FareCalculationLine}</span>
                                                                                    </div>
                                                                                )}
                                                                                {tktData.EndorsementRestrictions && (
                                                                                    <div className="flex gap-2">
                                                                                        <span className="text-slate-500 shrink-0">Endorsements:</span>
                                                                                        <span className="text-slate-700 dark:text-slate-300">{tktData.EndorsementRestrictions}</span>
                                                                                    </div>
                                                                                )}
                                                                                {Array.isArray(tktData.ItineraryDetails) && tktData.ItineraryDetails.length > 0 && (
                                                                                    <div>
                                                                                        <span className="text-slate-500 block mb-0.5">Itinerary:</span>
                                                                                        {tktData.ItineraryDetails.map((seg: any, si: number) => (
                                                                                            <div key={si} className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                                                                                                <Plane className="w-2.5 h-2.5 text-indigo-400 shrink-0" />
                                                                                                <span>{seg.Origin} → {seg.Destination}</span>
                                                                                                {seg.FlightNumber && <span className="bg-slate-100 dark:bg-slate-700 px-1 rounded">{seg.FlightNumber}</span>}
                                                                                                {seg.DepartureDate && <span>{seg.DepartureDate}</span>}
                                                                                            </div>
                                                                                        ))}
                                                                                    </div>
                                                                                )}
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )
                                    ) : (
                                        legacyCustomers.length > 0 && (
                                            <div>
                                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Passengers</p>
                                                <div className="space-y-1">
                                                    {legacyCustomers.map((c: any, i: number) => (
                                                        <div key={i} className="flex items-center justify-between gap-2">
                                                            <span className="text-slate-700 dark:text-slate-300">{c.PassengerTitle} {c.PassengerFirstName} {c.PassengerLastName}</span>
                                                            {c.ETicketNumber && (
                                                                <span className="font-mono text-[10px] bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                                                                    {c.ETicketNumber}
                                                                </span>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )
                                    )}
                                    {/* Segments */}
                                    {(() => {
                                        const items = hasNewStructure ? reservationItems : legacyItems;
                                        return items.length > 0 && (
                                            <div>
                                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Flight Segments</p>
                                                <div className="space-y-1.5">
                                                    {items.map((seg: any, i: number) => (
                                                        <div key={i} className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                                                            <Plane className="w-3 h-3 text-indigo-400 shrink-0" />
                                                            <span className="font-medium">{seg.DepartureAirportLocationCode} → {seg.ArrivalAirportLocationCode}</span>
                                                            <span className="text-slate-400">·</span>
                                                            <span>{seg.DepartureDateTime?.slice(0, 16).replace('T', ' ')}</span>
                                                            {seg.FlightNumber && <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1 rounded">{seg.MarketingAirlineCode ?? seg.AirlineCode}{seg.FlightNumber}</span>}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                    {/* Pricing */}
                                    {hasNewStructure ? (
                                        totalFare && (
                                            <div>
                                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Pricing</p>
                                                <div className="flex gap-4 text-slate-600 dark:text-slate-400">
                                                    <span>Total: <strong className="text-slate-800 dark:text-slate-200">{totalFare.Amount} {totalFare.CurrencyCode}</strong></span>
                                                </div>
                                            </div>
                                        )
                                    ) : (
                                        legacyPricing && (
                                            <div>
                                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Pricing</p>
                                                <div className="flex gap-4 text-slate-600 dark:text-slate-400">
                                                    {legacyPricing.TotalFare && <span>Total: <strong className="text-slate-800 dark:text-slate-200">{legacyPricing.TotalFare} {legacyPricing.CurrencyCode}</strong></span>}
                                                    {legacyPricing.BaseFare && <span>Base: {legacyPricing.BaseFare}</span>}
                                                    {legacyPricing.Taxes && <span>Taxes: {legacyPricing.Taxes}</span>}
                                                </div>
                                            </div>
                                        )
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                )}

                {/* ── Void Quote Panel ── */}
                {showVoidQuote && (
                    <div className="border-t border-amber-100 dark:border-amber-900/30 px-3 lg:px-5 py-3 bg-amber-50/40 dark:bg-amber-900/10">
                        <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-2">Void Quote</p>
                        {loadingVoidQuote && (
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Fetching void quote…
                            </div>
                        )}
                        {voidQuoteError && (
                            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {voidQuoteError}
                            </div>
                        )}
                        {voidQuoteData && !loadingVoidQuote && (
                            <div className="space-y-2 text-xs">
                                <div className="flex flex-wrap gap-3 text-slate-600 dark:text-slate-400">
                                    {voidQuoteData.ptrStatus && (
                                        <span>Status: <strong className="text-slate-800 dark:text-slate-200">{voidQuoteData.ptrStatus}</strong></span>
                                    )}
                                    {voidQuoteData.voidingWindow && (
                                        <span>Void window: <strong className="text-slate-800 dark:text-slate-200">{new Date(voidQuoteData.voidingWindow).toLocaleString()}</strong></span>
                                    )}
                                    {voidQuoteData.slaMinutes > 0 && (
                                        <span>SLA: <strong className="text-slate-800 dark:text-slate-200">{voidQuoteData.slaMinutes} min</strong></span>
                                    )}
                                </div>
                                {voidQuoteData.voidQuotes?.length > 0 && (
                                    <div>
                                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Refund Breakdown</p>
                                        <div className="space-y-1">
                                            {voidQuoteData.voidQuotes.map((q: any, i: number) => {
                                                // RefundDetails fields per Mystifly doc: TotalRefund, CancellationCharge, AdminFee
                                                // Passenger identity comes from TicketNumber + PassengerType (no name fields)
                                                const refundAmt = q.TotalRefund ?? q.TotalRefundAmount;
                                                const fee = Number(q.CancellationCharge ?? q.TotalVoidingFee ?? 0) + Number(q.AdminFee ?? q.AdminCharges ?? 0);
                                                const label = [q.TicketNumber, q.PassengerType].filter(Boolean).join(' · ');
                                                return (
                                                    <div key={i} className="flex items-center justify-between gap-2 bg-white dark:bg-slate-800/60 rounded-lg px-2.5 py-2 border border-amber-100 dark:border-amber-800/30">
                                                        <span className="text-slate-700 dark:text-slate-300 font-mono text-[10px]">{label || `Pax ${i + 1}`}</span>
                                                        <div className="text-right shrink-0">
                                                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">{refundAmt ?? '—'} {q.Currency}</span>
                                                            {fee > 0 && (
                                                                <p className="text-[10px] text-slate-400">Fee: {fee} {q.Currency}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Confirm Void / result */}
                                {voidResult ? (
                                    <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-3 py-2 border border-emerald-200 dark:border-emerald-800/40">
                                        <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                                        Void submitted (PTR: {voidResult.ptrId ?? '—'}). Refund will be processed within {voidResult.slaMinutes > 0 ? `${voidResult.slaMinutes} min` : 'the SLA window'}.
                                    </div>
                                ) : (
                                    <div className="pt-1 space-y-1.5">
                                        {voidError && (
                                            <div className="flex items-center gap-2 text-xs text-red-500 dark:text-red-400">
                                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {voidError}
                                            </div>
                                        )}
                                        <button
                                            onClick={handleConfirmVoid}
                                            disabled={confirmingVoid}
                                            className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 disabled:opacity-60 rounded-lg px-3 py-2 transition-colors"
                                        >
                                            {confirmingVoid ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                                            {confirmingVoid ? 'Processing void…' : 'Confirm Void & Refund'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Refund Quote Panel ── */}
                {showRefundQuote && (
                    <div className="border-t border-blue-100 dark:border-blue-900/30 px-3 lg:px-5 py-3 bg-blue-50/40 dark:bg-blue-900/10">
                        <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-2">Refund Quote</p>

                        {refundStep === 'quoting' && (
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Requesting refund quote…
                            </div>
                        )}

                        {refundError && (
                            <div className="flex items-center gap-2 text-xs text-red-500 dark:text-red-400">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {refundError}
                            </div>
                        )}

                        {refundStep === 'accepted' ? (
                            <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-3 py-2 border border-emerald-200 dark:border-emerald-800/40">
                                <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                                Refund accepted (PTR: {refundPtrId ?? '—'}). Your refund will be processed shortly.
                            </div>
                        ) : (refundStep === 'got' || refundStep === 'accepting') && refundQuoteData ? (
                            <div className="space-y-2 text-xs">
                                {refundQuoteData.ptrFee > 0 && (
                                    <div className="flex flex-wrap gap-3 text-slate-600 dark:text-slate-400">
                                        <span>PTR Fee: <strong className="text-slate-800 dark:text-slate-200">{refundQuoteData.ptrFee}</strong></span>
                                        <span>PTR ID: <strong className="font-mono text-slate-800 dark:text-slate-200">{refundPtrId}</strong></span>
                                    </div>
                                )}

                                {refundQuoteData.passengerChanges?.length > 0 && (
                                    <div>
                                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Refund Breakdown</p>
                                        <div className="space-y-1">
                                            {refundQuoteData.passengerChanges.map((p: any, i: number) => {
                                                // RefundDetails fields per Mystifly doc: TotalRefund, CancellationCharge
                                                // Passenger identity: TicketNumber + PassengerType (no name fields in RefundDetails)
                                                const refundAmt = p.TotalRefund ?? p.TotalRefundAmount;
                                                const penalty = Number(p.CancellationCharge ?? p.TotalPenalty ?? 0);
                                                const label = [p.TicketNumber, p.PassengerType].filter(Boolean).join(' · ');
                                                return (
                                                    <div key={i} className="flex items-center justify-between gap-2 bg-white dark:bg-slate-800/60 rounded-lg px-2.5 py-2 border border-blue-100 dark:border-blue-800/30">
                                                        <span className="text-slate-700 dark:text-slate-300 font-mono text-[10px]">{label || `Pax ${i + 1}`}</span>
                                                        <div className="text-right shrink-0">
                                                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">{refundAmt ?? '—'} {p.Currency}</span>
                                                            {penalty > 0 && (
                                                                <p className="text-[10px] text-slate-400">Penalty: {penalty} {p.Currency}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                <div className="pt-1 space-y-1.5">
                                    {refundError && (
                                        <div className="flex items-center gap-2 text-xs text-red-500 dark:text-red-400">
                                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {refundError}
                                        </div>
                                    )}
                                    <button
                                        onClick={handleAcceptRefund}
                                        disabled={(['accepting'] as string[]).includes(refundStep)}
                                        className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-60 rounded-lg px-3 py-2 transition-colors"
                                    >
                                        {(['accepting'] as string[]).includes(refundStep) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                                        {(['accepting'] as string[]).includes(refundStep) ? 'Processing refund…' : 'Accept & Submit Refund'}
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </div>
                )}

                {/* ── Reissue / Change Flight Panel ── */}
                {showReissue && (
                    <div className="border-t border-violet-100 dark:border-violet-900/30 px-3 lg:px-5 py-3 bg-violet-50/40 dark:bg-violet-900/10">
                        <p className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wide mb-2">Change Flight (Reissue)</p>
                        {reissueStep === 'accepted' ? (
                            <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-3 py-2 border border-emerald-200 dark:border-emerald-800/40">
                                <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                                Reissue submitted. Your updated itinerary will be confirmed shortly.
                            </div>
                        ) : (
                            <div className="space-y-3 text-xs">
                                {/* Segment editors */}
                                <div className="space-y-2">
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">New Flight Details</p>
                                    {reissueNewSegments.map((seg, i) => (
                                        <div key={i} className="bg-white dark:bg-slate-800/60 rounded-lg px-2.5 py-2.5 border border-violet-100 dark:border-violet-800/30 space-y-2">
                                            <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                                {seg.label}: {seg.originLocationCode} → {seg.destinationLocationCode}
                                            </p>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="col-span-2">
                                                    <label className="text-[10px] text-slate-400 block mb-0.5">New Departure Date</label>
                                                    <input
                                                        type="date"
                                                        value={seg.departureDate}
                                                        onChange={e => setReissueNewSegments(prev => prev.map((s, idx) => idx === i ? { ...s, departureDate: e.target.value } : s))}
                                                        className="w-full text-xs bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md px-2 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-400"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-slate-400 block mb-0.5">Airline Code</label>
                                                    <input
                                                        type="text"
                                                        maxLength={3}
                                                        placeholder="7C"
                                                        value={seg.airlineCode}
                                                        onChange={e => setReissueNewSegments(prev => prev.map((s, idx) => idx === i ? { ...s, airlineCode: e.target.value.toUpperCase() } : s))}
                                                        className="w-full text-xs bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md px-2 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-400 font-mono uppercase"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-slate-400 block mb-0.5">Cabin</label>
                                                    <select
                                                        value={seg.cabinPreference}
                                                        onChange={e => setReissueNewSegments(prev => prev.map((s, idx) => idx === i ? { ...s, cabinPreference: e.target.value } : s))}
                                                        className="w-full text-xs bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md px-2 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-400"
                                                    >
                                                        <option value="Y">Economy (Y)</option>
                                                        <option value="C">Business (C)</option>
                                                        <option value="F">First (F)</option>
                                                        <option value="S">Premium Eco (S)</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {reissueError && (
                                    <div className="flex items-center gap-2 text-xs text-red-500 dark:text-red-400">
                                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {reissueError}
                                    </div>
                                )}

                                {/* Get Quote button */}
                                {reissueStep !== 'got' && reissueStep !== 'accepting' && (
                                    <button
                                        onClick={handleReissueQuote}
                                        disabled={reissueStep === 'quoting' || reissueNewSegments.length === 0}
                                        className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-60 rounded-lg px-3 py-2 transition-colors"
                                    >
                                        {reissueStep === 'quoting' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowLeftRight className="w-3.5 h-3.5" />}
                                        {reissueStep === 'quoting' ? 'Getting quote…' : 'Get Reissue Quote'}
                                    </button>
                                )}

                                {/* Quote result */}
                                {reissueQuoteData && (reissueStep === 'got' || reissueStep === 'accepting') && (
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap gap-3 text-slate-600 dark:text-slate-400">
                                            {reissueQuoteData.priceChange != null && (
                                                <span>Price change: <strong className={reissueQuoteData.priceChange >= 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}>
                                                    {reissueQuoteData.priceChange >= 0 ? '+' : ''}{reissueQuoteData.priceChange}
                                                </strong></span>
                                            )}
                                        </div>
                                        {reissueQuoteData.passengerChanges?.length > 0 && (
                                            <div>
                                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Change Breakdown</p>
                                                <div className="space-y-1">
                                                    {reissueQuoteData.passengerChanges.map((p: any, i: number) => {
                                                        const changeAmt = p.PriceChange ?? p.TotalChange ?? p.TotalFare;
                                                        const label = [p.TicketNumber, p.PassengerType].filter(Boolean).join(' · ');
                                                        return (
                                                            <div key={i} className="flex items-center justify-between gap-2 bg-white dark:bg-slate-800/60 rounded-lg px-2.5 py-2 border border-violet-100 dark:border-violet-800/30">
                                                                <span className="text-slate-700 dark:text-slate-300 font-mono text-[10px]">{label || `Pax ${i + 1}`}</span>
                                                                <span className={`font-semibold text-[11px] ${(changeAmt ?? 0) >= 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                                                    {changeAmt != null ? `${changeAmt >= 0 ? '+' : ''}${changeAmt}` : '—'} {p.Currency}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                        <div className="pt-1 space-y-1.5">
                                            <button
                                                onClick={handleConfirmReissue}
                                                disabled={reissueStep === 'accepting'}
                                                className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-60 rounded-lg px-3 py-2 transition-colors"
                                            >
                                                {reissueStep === 'accepting' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                                                {reissueStep === 'accepting' ? 'Processing change…' : 'Confirm Flight Change'}
                                            </button>
                                            <button
                                                onClick={() => { setReissueStep('idle'); setReissueQuoteData(null); setReissueError(null); }}
                                                className="w-full text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 py-1 transition-colors"
                                            >
                                                ← Edit and get new quote
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}
