"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { CheckCircle, XCircle, AlertTriangle, Loader2, RefreshCw, RotateCcw, ChevronDown, ChevronUp, Plane, Receipt, ArrowLeftRight, Check, Download } from 'lucide-react';
import type { FlightBookingRecord } from '@/services/booking.service';
import { formatCurrency } from '@/lib/utils';
import { formatBookingDate, formatBookingTime } from '@/utils/flight-utils';
import { convertCurrency } from '@/lib/currency';
import { useUserCurrency } from '@/stores/searchStore';
import { FormDatePicker } from '@/components/common/FormDatePicker';
import { bookingToFlightOffer } from '@/lib/trips/booking-itinerary';
import { FlightSummaryHeader } from '@/components/trips/FlightSummaryHeader';
import { FlightItineraryDetails } from '@/components/flights/FlightItineraryDetails';

interface FlightBookingCardProps {
    booking: FlightBookingRecord;
    onCancelled?: (bookingId: string) => void;
}

// Statuses that allow initiating (or retrying) a cancellation request
const CANCELLABLE_STATUSES = new Set(['confirmed', 'ticketed', 'booked', 'pnr_created', 'awaiting_ticket', 'cancel_failed', 'refund_failed', 'cancel_requested']);

// ─── Status chip ─────────────────────────────────────────────────────

/**
 * One shape for every status the card can be in.
 *
 * The design draws status as a single rounded pill; what changes between a refunded
 * booking and a failed cancellation is the tone, never the chrome. This used to be nine
 * hand-written spans, only one of which was a pill, so the most important line on the
 * card changed shape depending on what had happened to the booking.
 */
type StateChipTone = 'amber' | 'emerald' | 'rose' | 'purple' | 'teal' | 'slate';

/**
 * The design fills the pill rather than tinting it — #ffda09 at 52%, carrying near-black
 * text, which is what lets a status read at a glance from across the list. The amber tone
 * is the one the design draws; the rest follow its treatment in their own hue.
 */
const STATE_CHIP_TONES: Record<StateChipTone, string> = {
    amber: 'bg-[#ffda09]/[0.52] dark:bg-[#ffda09]/80 text-slate-900 border-transparent',
    emerald: 'bg-emerald-300/[0.52] dark:bg-emerald-300/80 text-emerald-950 border-transparent',
    rose: 'bg-rose-300/[0.52] dark:bg-rose-300/80 text-rose-950 border-transparent',
    purple: 'bg-purple-300/[0.52] dark:bg-purple-300/80 text-purple-950 border-transparent',
    teal: 'bg-teal-300/[0.52] dark:bg-teal-300/80 text-teal-950 border-transparent',
    slate: 'bg-slate-300/[0.52] dark:bg-slate-300/80 text-slate-900 border-transparent',
};

function StateChip({ tone, children }: { tone: StateChipTone; children: React.ReactNode }) {
    return (
        <span
            className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-0.5 rounded-full border whitespace-nowrap ${STATE_CHIP_TONES[tone]}`}
        >
            {children}
        </span>
    );
}

// ─── Cancel Confirmation Modal ───────────────────────────────────────

interface CancelModalProps {
    booking: FlightBookingRecord;
    onConfirm: (cancellationId?: string) => void;
    onClose: () => void;
    isLoading: boolean;
    error: string | null;
    displayCurrency: string;
}

function CancelModal({ booking, onConfirm, onClose, isLoading, error, displayCurrency }: CancelModalProps) {
    const t = useTranslations('trips');
    const [mounted, setMounted] = useState(false);
    const [quoteLoading, setQuoteLoading] = useState(booking.provider === 'duffel');
    const [quoteData, setQuoteData] = useState<{ refundAmount: number; refundCurrency: string; penaltyAmount: number; cancellationId: string | null } | null>(null);
    const [quoteError, setQuoteError] = useState<string | null>(null);

    useEffect(() => {
        setMounted(true);
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = 'unset'; };
    }, []);

    // Fetch live Duffel quote on mount.
    //
    // Every call to cancel-quote creates a new order_cancellation at Duffel, and
    // Duffel accepts a confirm only for the most recent one. A discarded run that
    // still completes its request therefore invalidates the id this modal is
    // holding — the traveller then gets "The order cancellation is not the latest
    // for this order" on confirm. StrictMode double-invokes this effect in dev, so
    // the request has to be aborted, not merely ignored.
    useEffect(() => {
        if (booking.provider !== 'duffel') return;
        const abort = new AbortController();
        setQuoteLoading(true);
        fetch('/api/flights/cancel-quote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bookingId: booking.id }),
            signal: abort.signal,
        })
            .then(r => r.json())
            .then(data => {
                if (abort.signal.aborted) return;
                if (data.success) {
                    setQuoteData({ refundAmount: data.refundAmount, refundCurrency: data.refundCurrency, penaltyAmount: data.penaltyAmount, cancellationId: data.cancellationId });
                } else if (data.requiresManualCancellation) {
                    setQuoteError(t('flightBookingCard.cancelModal.cannotCancelOnline'));
                } else if (!data.noQuote) {
                    setQuoteError(data.error ?? t('flightBookingCard.cancelModal.noQuote'));
                }
            })
            .catch((err) => { if (err?.name !== 'AbortError') setQuoteError(t('flightBookingCard.cancelModal.networkError')); })
            .finally(() => { if (!abort.signal.aborted) setQuoteLoading(false); });
        return () => { abort.abort(); };
    }, [booking.id, booking.provider]);

    const fmtAmount = (amount: number, fromCurrency: string) =>
        formatCurrency(convertCurrency(amount, fromCurrency, displayCurrency), displayCurrency);

    // Build the refund summary line for Duffel (live quote) vs Mystifly (stored policy)
    const renderRefundSummary = () => {
        if (booking.provider === 'duffel') {
            if (quoteLoading) {
                return (
                    <li className="flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                        {t('flightBookingCard.cancelModal.checkingRefund')}
                    </li>
                );
            }
            if (quoteError) {
                return <li className="text-red-600 dark:text-red-400">{quoteError}</li>;
            }
            if (quoteData) {
                const hasRefund = quoteData.refundAmount > 0;
                const isFareNonRefundable = booking.fare_policy?.isRefundable === false;
                if (!hasRefund) {
                    return (
                        <li className="font-semibold text-red-600 dark:text-red-400">
                            {t('flightBookingCard.cancelModal.noRefund')}
                        </li>
                    );
                }
                if (isFareNonRefundable) {
                    return (
                        <>
                            <li className="font-semibold text-emerald-700 dark:text-emerald-400">
                                {t('flightBookingCard.cancelModal.taxesRefund', { amount: fmtAmount(quoteData.refundAmount, quoteData.refundCurrency) })}
                            </li>
                            <li>{t('flightBookingCard.cancelModal.baseFareNonRefundable')}</li>
                        </>
                    );
                }
                return (
                    <li className="font-semibold text-emerald-700 dark:text-emerald-400">
                        {t('flightBookingCard.cancelModal.willReceive', { amount: fmtAmount(quoteData.refundAmount, quoteData.refundCurrency) })}
                    </li>
                );
            }
            // Fallback to stored policy if quote unavailable
        }

        // Mystifly or Duffel fallback
        if (booking.fare_policy?.isRefundable === false) {
            return (
                <>
                    <li className="font-bold text-red-600 dark:text-red-400">{t('flightBookingCard.cancelModal.fareRulesNonRefundable')}</li>
                    <li>{t('flightBookingCard.cancelModal.zeroRefund')}</li>
                </>
            );
        }
        return (
            <>
                <li>{t('flightBookingCard.cancelModal.refundEligibility')}</li>
                {booking.fare_policy?.refundPenaltyAmount ? (
                    <li>{t('flightBookingCard.cancelModal.estimatedPenalty', { amount: fmtAmount(booking.fare_policy.refundPenaltyAmount, booking.fare_policy.refundPenaltyCurrency || booking.currency || 'USD') })}</li>
                ) : (
                    <li>{t('flightBookingCard.cancelModal.penaltiesDeducted')}</li>
                )}
            </>
        );
    };

    if (!mounted) return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 max-w-md w-full p-6 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                    </div>
                <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">{t('flightBookingCard.cancelModal.title')}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('flightBookingCard.cancelModal.pnr', { pnr: booking.pnr })}</p>
                </div>
                </div>

                {/* Refund summary */}
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-4 text-xs text-amber-900 dark:text-amber-400 space-y-2">
                    <p className="font-semibold text-amber-800 dark:text-amber-500">{t('flightBookingCard.cancelModal.refundPolicy')}</p>
                    <ul className="list-disc list-inside space-y-1 text-amber-700 dark:text-amber-400/90">
                        {renderRefundSummary()}
                        <li>{t('flightBookingCard.cancelModal.refundTiming')}</li>
                        <li className="font-semibold pt-1 text-amber-800 dark:text-amber-500">{t('flightBookingCard.cancelModal.cannotUndo')}</li>
                    </ul>
                </div>

                {error && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4 text-xs text-red-700 dark:text-red-400">
                        {error}
                    </div>
                )}

                {/* Buttons */}
                <div className="flex gap-3 mt-2">
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                    >
                        {t('flightBookingCard.cancelModal.keepBooking')}
                    </button>
                    <button
                        onClick={() => onConfirm(quoteData?.cancellationId ?? undefined)}
                        disabled={isLoading || quoteLoading}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                {t('flightBookingCard.cancelModal.cancelling')}
                            </>
                        ) : quoteLoading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                {t('flightBookingCard.cancelModal.loading')}
                            </>
                        ) : (
                            t('flightBookingCard.cancelModal.confirmCancel')
                        )}
                    </button>
                </div>
            </motion.div>
        </div>,
        document.body
    );
}

// ─── Main Component ──────────────────────────────────────────────────

export default function FlightBookingCard({ booking, onCancelled }: FlightBookingCardProps) {
    const t = useTranslations('trips');
    // The post-ticketing panels (void, refund, change flight) — hardcoded English until BG-13.
    const tm = useTranslations('trips.flightBookingCard.manage');
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const [cancelError, setCancelError] = useState<string | null>(null);
    // 'reissued' is a client-side state only: a successful reissue is reflected on the
    // card straight away, while the column it came from has no such value to store.
    const [localStatus, setLocalStatus] = useState<FlightBookingRecord['status'] | 'reissued'>(booking.status);
    const [cancelSuccessStatus, setCancelSuccessStatus] = useState<string | null>(null);
    const [localRefundAmount, setLocalRefundAmount] = useState<number | null>(null);
    const [localRefundCurrency, setLocalRefundCurrency] = useState<string | null>(null);
    const [showFlightItinerary, setShowFlightItinerary] = useState(false);
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
        // For Duffel, always allow the refund quote panel — Duffel's cancellation API is the source of truth, not the stored fare_policy flag
        if (!fareEligibility.isRefundable && !isDuffel) { setShowRefundQuote(false); setRefundStep('idle'); setRefundError(null); }
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
    const liveUserCurrency = useUserCurrency();
    const bookingCurrency = booking.currency || 'USD';
    const [frozenUserCurrency, setFrozenUserCurrency] = useState<string | null>(null);
    // Re-freeze whenever the traveller picks a different currency. Depending on
    // liveUserCurrency rather than [] keeps the original intent — a mid-session
    // exchange-rate fetch must not move the figures on screen — while still
    // honouring a deliberate change from the currency selector, which an empty
    // dependency array ignored until a full page reload.
    useEffect(() => { setFrozenUserCurrency(liveUserCurrency); }, [liveUserCurrency]);
    const userCurrency = frozenUserCurrency ?? bookingCurrency;
    const convertPrice = (amount: number, fromCurrency = bookingCurrency) =>
        mounted ? Math.round(convertCurrency(amount, fromCurrency, userCurrency)) : amount;
    const displayCurrency = mounted ? userCurrency : bookingCurrency;

    // Freeze "Total paid" against rate churn — it uses the rates current when the
    // currency was chosen, so an async ECB fetch can't make the figure drift while
    // the traveller is looking at it. It is not frozen against the traveller:
    // changing the selector recomputes it.
    const [frozenTotal, setFrozenTotal] = useState<{ amount: number; currency: string } | null>(null);
    useEffect(() => {
        const raw = booking.charged_price ?? booking.total_price;
        setFrozenTotal({
            amount: Math.round(convertCurrency(raw, bookingCurrency, liveUserCurrency)),
            currency: liveUserCurrency,
        });
    }, [liveUserCurrency]); // eslint-disable-line react-hooks/exhaustive-deps

    const segments = booking.flight_segments || [];
    const firstSegment = segments[0];
    const lastSegment = segments[segments.length - 1];

    const isUpcoming = firstSegment && new Date(firstSegment.departure) > new Date();
    const isPast = lastSegment && new Date(lastSegment.arrival) < new Date();

    // Check if last cancel attempt required manual intervention (ERCBK007 — ticketed booking)
    const lastLog = booking.cancellation_log?.[booking.cancellation_log.length - 1];
    const requiresManualCancellation = lastLog?.requiresManualCancellation === true;

    const canCancel = CANCELLABLE_STATUSES.has(localStatus) && !requiresManualCancellation;

    let tripType = t('flightBookingCard.tripTypes.oneWay');
    let mainDestination = lastSegment?.destination;
    const origin = firstSegment?.origin;

    if (booking.trip_type) {
        const map: Record<string, string> = {
            'one-way': t('flightBookingCard.tripTypes.oneWay'), 'round-trip': t('flightBookingCard.tripTypes.roundTrip'), 'multi-city': t('flightBookingCard.tripTypes.multiCity'),
        };
        tripType = map[booking.trip_type] ?? t('flightBookingCard.tripTypes.oneWay');

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
            tripType = t('flightBookingCard.tripTypes.roundTrip');
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
            if (hasLongLayoverOrGap) tripType = t('flightBookingCard.tripTypes.multiCity');
        }
    }


    // The booking's segments, in the shape the shared itinerary components already know
    // how to draw — the same component the search card and the book page use. Handles its
    // own leg-grouping (segment_index, falling back to a 24h-gap boundary for legacy rows)
    // — see booking-itinerary.ts — so this file no longer needs its own copy of that rule.
    const bookingOffer = useMemo(() => bookingToFlightOffer(booking), [booking]);

    // ── Cancel handler ──────────────────────────────────────────────
    const handleCancelConfirm = async (cancellationId?: string) => {
        setIsCancelling(true);
        setCancelError(null);
        try {
            const res = await fetch('/api/flights/cancel-booking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookingId: booking.id, ...(cancellationId && { cancellationId }) }),
            });
            const data = await res.json();

            if (!res.ok || !data.success) {
                if (data.requiresManualCancellation) {
                    const isMystifly = booking.provider === 'mystifly_v2';
                    setCancelError(
                        isMystifly
                            ? t('flightBookingCard.amErrors.mystiflyCannotCancel')
                            : t('flightBookingCard.amErrors.duffelCannotCancel')
                    );
                    setShowCancelModal(false);
                } else {
                    setCancelError(data.error || t('flightBookingCard.amErrors.cancelFailed'));
                }
                setLocalStatus('cancel_failed');
                return;
            }

            setLocalStatus(data.status as FlightBookingRecord['status']); // 'refunded' or 'refund_pending' or 'refund_failed'
            setCancelSuccessStatus(data.status);
            if (data.refundAmount !== undefined) setLocalRefundAmount(data.refundAmount);
            if (data.refundCurrency) setLocalRefundCurrency(data.refundCurrency);
            setShowCancelModal(false);
            onCancelled?.(booking.id);
        } catch {
            setCancelError(t('flightBookingCard.amErrors.networkError'));
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
                setTripDetailsError(data.error || t('flightBookingCard.couldNotLoadTripDetails'));
            }
        } catch {
            setTripDetailsError(t('flightBookingCard.amErrors.networkError'));
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
                setTicketDisplayData(prev => ({ ...prev, [ticketNumber]: { error: data.error || tm('errors.ticketDetails') } }));
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
                headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
                // The PNR is no longer sent: the route reads it from the booking row it
                // authorises, so the client cannot aim a note at someone else's reservation.
                body: JSON.stringify({ notes: [noteText.trim()], bookingId: booking.id }),
            });
            const data = await res.json();
            if (data.success) {
                setNoteSuccess(true);
                setNoteText('');
                fetchNotes();
            } else {
                setNoteError(data.error || tm('errors.addNote'));
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
                    setVoidQuoteError(detailsData.error || tm('errors.detailsForTickets'));
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
                setVoidQuoteError(data.error || tm('errors.voidQuote'));
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
                    setRefundError(tm('errors.tripDetails'));
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
                setRefundError(data.error || tm('errors.refundFailed'));
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
                else { setReissueError(d.error || tm('errors.tripDetails')); setReissueStep('idle'); return; }
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
                setReissueError(data.error || tm('errors.reissueQuote'));
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
            if (data.success) { setReissueStep('accepted'); setLocalStatus('reissued'); }
            else { setReissueError(data.error || 'Reissue failed. Please try again.'); setReissueStep('got'); }
        } catch {
            setReissueError('Network error. Please try again.');
            setReissueStep('got');
        }
    };

    // Helper to render the right side state chip
    const renderStateChip = () => {
        const chip = (tone: StateChipTone, icon: React.ReactNode, label: React.ReactNode) => (
            <StateChip tone={tone}>{icon}{label}</StateChip>
        );

        if (localStatus === 'cancel_requested') {
            return chip('amber', <AlertTriangle className="w-3 h-3 shrink-0" />, t('flightBookingCard.stateChips.cancelStuck'));
        }
        if (localStatus === 'refund_pending') {
            return chip('purple', <RefreshCw className="w-3 h-3 shrink-0" />, t('flightBookingCard.stateChips.refundProcessing'));
        }
        if (localStatus === 'refunded') {
            return chip('teal', <CheckCircle className="w-3 h-3 shrink-0" />, t('flightBookingCard.stateChips.refunded'));
        }
        if (localStatus === 'refund_failed') {
            return chip('rose', <XCircle className="w-3 h-3 shrink-0" />, t('flightBookingCard.stateChips.refundFailed'));
        }
        if (localStatus === 'cancel_failed') {
            return requiresManualCancellation
                ? chip(
                    'amber',
                    <AlertTriangle className="w-3 h-3 shrink-0" />,
                    booking.provider === 'mystifly_v2'
                        ? t('flightBookingCard.stateChips.emailToCancel')
                        : t('flightBookingCard.stateChips.contactSupport'),
                )
                : chip('rose', <XCircle className="w-3 h-3 shrink-0" />, t('flightBookingCard.stateChips.cancelFailed'));
        }
        if (isUpcoming && (localStatus === 'ticketed' || localStatus === 'awaiting_ticket')) {
            return chip(
                'emerald',
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shrink-0" />,
                t('flightBookingCard.stateChips.upcomingFlight'),
            );
        }
        // Neither upcoming nor past: departure has happened, arrival hasn't — the window
        // renderStateChip previously had no branch for, so nothing was shown at all.
        //
        // Requires segments: with none, isUpcoming and isPast are both undefined rather
        // than false, and a booking whose flights we cannot see would claim to be in the
        // air on the strength of two missing values.
        if (localStatus === 'ticketed' && segments.length > 0 && !isUpcoming && !isPast) {
            return chip('amber', <Check className="w-3 h-3 shrink-0" />, t('flightBookingCard.stateChips.flightInProgress'));
        }
        if (localStatus === 'awaiting_ticket') {
            return chip(
                'amber',
                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse shrink-0" />,
                t('flightBookingCard.stateChips.awaitingConfirmation'),
            );
        }
        if (isPast && localStatus === 'ticketed') {
            return chip('slate', null, t('flightBookingCard.stateChips.flightCompleted'));
        }
        if (localStatus === 'cancelled' || localStatus === 'cancelled_provider_missing') {
            return (
                <div className="flex flex-col items-end gap-0.5">
                    {chip('rose', <XCircle className="w-3 h-3 shrink-0" />, t('flightBookingCard.stateChips.cancelled'))}
                    {localStatus === 'cancelled_provider_missing' && (
                        <span className="text-[9px] text-slate-400 whitespace-nowrap">{t('flightBookingCard.stateChips.supplierNotFound')}</span>
                    )}
                </div>
            );
        }
        // The three states the narrow layout's own map covered and this did not. Without
        // them the wide layout showed an empty status column for a booking that had failed
        // outright, which reads as "nothing is wrong".
        if (localStatus === 'booked') {
            return chip(
                'amber',
                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse shrink-0" />,
                t('flightBookingCard.stateChips.processing'),
            );
        }
        if (localStatus === 'pnr_created') {
            return chip('amber', <CheckCircle className="w-3 h-3 shrink-0" />, t('flightBookingCard.stateChips.booked'));
        }
        if (localStatus === 'failed') {
            return chip('rose', <XCircle className="w-3 h-3 shrink-0" />, t('flightBookingCard.stateChips.bookingFailed'));
        }
        if (localStatus === 'reissued') {
            return chip('purple', <RotateCcw className="w-3 h-3 shrink-0" />, t('flightBookingCard.stateChips.reissued'));
        }
        // A status nobody here has a name for is still a status. Saying "Unknown" sends a
        // traveller to support; saying nothing lets them assume the booking is fine.
        return chip('slate', null, t('flightBookingCard.stateChips.unknown'));
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
                    displayCurrency={displayCurrency}
                />
            )}

            <div className="bg-white dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all group cursor-default">

                {/* ── Cancellation success banner ── */}
                {cancelSuccessStatus && (
                    <div className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium ${
                        cancelSuccessStatus === 'refunded'
                            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-b border-emerald-200 dark:border-emerald-800'
                            : cancelSuccessStatus === 'refund_pending'
                            ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border-b border-purple-200 dark:border-purple-800'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700'
                    }`}>
                        <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                        {cancelSuccessStatus === 'refunded'
                            ? t('flightBookingCard.successBanners.refundProcessed')
                            : cancelSuccessStatus === 'refund_pending'
                            ? t('flightBookingCard.successBanners.refundProcessing')
                            : t('flightBookingCard.successBanners.cancelled')}
                    </div>
                )}

                {/* ── MOBILE layout ── */}
                <div className="flex flex-row md:hidden min-h-[96px]">
                    {/* Visual Header */}
                    <div className="relative w-24 min-h-[96px] flex-shrink-0 bg-white dark:bg-slate-800 flex flex-col items-center justify-center rounded-l-xl border-r border-slate-100 dark:border-slate-700">
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
                    </div>

                    {/* Content */}
                    <div className="flex-1 p-2.5 flex flex-col min-w-0">
                        {/* The same chip the wide layout draws, in the same words. It leads
                            the column rather than sitting over the logo: at this width the
                            logo tile is 96px and a label like "Cancellation stuck — retry
                            below" has nowhere to go there. `flex` so the chip shrink-wraps
                            instead of stretching to the column. */}
                        <div className="flex mb-1">{renderStateChip()}</div>
                        <h3 className="text-[clamp(0.75rem,2vw,0.875rem)] font-bold text-slate-900 dark:text-white mb-0.5 leading-tight truncate">
                            {firstSegment ? `${origin} to ${mainDestination}` : t('flightBookingCard.flightBooking')}
                        </h3>
                        {firstSegment && lastSegment && (
                            <div className="text-[clamp(0.625rem,1.5vw,0.75rem)] text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1.5 truncate">
                                <span className="bg-slate-100 dark:bg-slate-800 px-1 rounded font-medium shrink-0">{tripType}</span>
                                <span className="truncate">{formatBookingDate(firstSegment.departure)} · {formatBookingTime(firstSegment.departure)} → {formatBookingTime(lastSegment.arrival)}</span>
                            </div>
                        )}
                        <div className="text-[clamp(0.625rem,1.5vw,0.75rem)] text-slate-500 dark:text-slate-400 mb-1.5 flex flex-wrap gap-2">
                            <span className="font-mono">{booking.pnr}</span>
                            <span>·</span>
                            <span>{t('flightBookingCard.pax', { count: booking.passengers?.length || 0 })}</span>
                            {/* Seat badges — mobile */}
                            {booking.passengers?.some(p => p.seat_number) && (
                                <span className="flex items-center gap-1">
                                    <span>·</span>
                                    {booking.passengers.filter(p => p.seat_number).map((p, idx) => (
                                        <span key={idx} className="font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-1 rounded text-[9px]">
                                            {p.seat_number}
                                        </span>
                                    ))}
                                </span>
                            )}
                        </div>
                        <div className="mt-auto flex items-center justify-between gap-2">
                            <span className="text-[clamp(0.875rem,2.5vw,1rem)] font-bold text-slate-900 dark:text-white">
                                {formatCurrency(
                                    frozenTotal?.amount ?? (booking.charged_price ?? booking.total_price),
                                    frozenTotal?.currency ?? bookingCurrency
                                )}
                            </span>
                            {canCancel && (
                                <button
                                    onClick={() => setShowCancelModal(true)}
                                    className="text-[10px] font-medium text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 border border-red-200 dark:border-red-800 rounded px-1.5 py-0.5 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
                                >
                                    {t('flightBookingCard.cancel')}
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
                            <span className="flex items-center gap-1"><Plane className="w-3 h-3" /> {t('flightBookingCard.airlineBookingDetails')}</span>
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
                                        {t('flightBookingCard.voidQuote')}
                                    </span>
                                    {!loadingVoidQuote && (showVoidQuote ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                </button>
                            ) : (
                                <div className="flex items-center gap-1.5 px-2.5 py-2 text-[10px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800">
                                    <XCircle className="w-3 h-3 shrink-0" /> {t('flightBookingCard.voidNotAvailablePolicy')}
                                </div>
                            )}
                            {fareEligibility === null || fareEligibility.isRefundable || isDuffel ? (
                                <button
                                    onClick={handleRefundQuote}
                                    className="w-full flex items-center justify-between px-2.5 py-2 text-[10px] text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 border-t border-slate-100 dark:border-slate-800 transition-colors"
                                >
                                    <span className="flex items-center gap-1">
                                        {['quoting', 'accepting'].includes(refundStep) ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                                        {t('flightBookingCard.refundQuote')}
                                    </span>
                                    {!['quoting', 'accepting'].includes(refundStep) && (showRefundQuote ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                </button>
                            ) : (
                                <div className="flex items-center gap-1.5 px-2.5 py-2 text-[10px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800">
                                    <XCircle className="w-3 h-3 shrink-0" /> {t('flightBookingCard.refundNotAvailablePolicy')}
                                </div>
                            )}
                        </>)}
                    </div>
                )}

                {/* ── DESKTOP layout ── */}
                <div className="hidden md:flex flex-row">
                    {/* Content */}
                    <div className="flex-1 p-5 flex flex-col min-w-0">
                        {/* The summary the trips list and a trip's own page share. */}
                        <FlightSummaryHeader booking={booking} />

                        {/* Seat assignments, when there are any. The e-ticket numbers and
                            the "changeable" note used to sit here too; the design keeps the
                            card to what a traveller reads at a glance, and both of those
                            live on the trip's own page. */}
                        <div className="space-y-1.5 empty:hidden mt-2">
                            {/* Seat assignments — shown when seats were pre-selected at booking */}
                            {booking.passengers?.some(p => p.seat_number) && (
                                <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-blue-500 font-bold px-1 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-[9px] uppercase border border-blue-100 dark:border-blue-800 shrink-0">SEAT</span>
                                        <span className="font-medium text-[11px] text-slate-600 dark:text-slate-300">{t('flightBookingCard.assignedSeats')}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2 text-[10px]">
                                        {booking.passengers.filter(p => p.seat_number).map((p, idx) => (
                                            <span key={idx} className="text-slate-500 flex items-center gap-1">
                                                {p.first_name} {p.last_name}
                                                <span className="text-slate-300 dark:text-slate-600">|</span>
                                                <span className="font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded">{p.seat_number}</span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>

                    {/* Right panel — status, price, and the two links. White like the rest
                        of the card: the divider alone sets it apart. */}
                    <div className="flex flex-col w-[220px] shrink-0 border-l border-slate-100 dark:border-slate-800">
                        <div className="flex-1 flex flex-col items-end p-5 gap-2">
                            {/* The status leads the column. */}
                            <div className="w-full flex justify-end">{renderStateChip()}</div>

                            {/* "Total paid" and the amount read as one line, not a stacked
                                label: same size, and only the figure carries the weight. */}
                            <div className="flex items-baseline justify-end gap-1.5 w-full">
                                <span className="text-[16px] text-[#939fb1] dark:text-slate-400 whitespace-nowrap">{t('flightBookingCard.totalPaid')}:</span>
                                <span className="text-[16px] font-bold text-slate-900 dark:text-white">
                                    {formatCurrency(
                                        frozenTotal?.amount ?? (booking.charged_price ?? booking.total_price),
                                        frozenTotal?.currency ?? bookingCurrency
                                    )}
                                </span>
                            </div>

                            {/* Trip details — right under the price, caret down like the
                                itinerary toggle it echoes. */}
                            <a
                                href={`/trips/${booking.id}`}
                                className="inline-flex items-center gap-1 text-[11px] text-slate-900 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            >
                                <ChevronDown className="w-3 h-3" />
                                {t('flightBookingCard.details')}
                            </a>

                            {/* The receipt belongs with the figures it is a record of. */}
                            <a
                                href={`/trips/invoice/${booking.id}?type=flight`}
                                className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline transition-colors"
                            >
                                <Download className="w-3.5 h-3.5 shrink-0" />
                                {t('flightBookingCard.receipt')}
                            </a>

                            {/* What came back, for a booking that has been cancelled.
                                empty:hidden because an empty flex child still takes its
                                share of the column's gap, which padded this column out past
                                the summary beside it and showed up as blank space under the
                                flight info. */}
                            <div className="flex flex-col items-end gap-2 w-full mt-2 empty:hidden">
                                {(localStatus === 'cancelled' || localStatus === 'refunded' || localStatus === 'refund_pending') && (() => {
                                    const refundAmt = localRefundAmount !== null ? localRefundAmount : (booking.refund_amount ?? 0);
                                    const refundCurr = localRefundCurrency ?? booking.refund_currency ?? 'USD';
                                    const hasRefund = refundAmt > 0;
                                    if (!hasRefund && localRefundAmount === null && booking.refund_amount === undefined) return null;
                                    return (
                                        <div className={`text-right mt-1 p-2 rounded border w-full ${hasRefund ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                                            <div className="text-[10px] text-slate-500 dark:text-slate-400">{t('flightBookingCard.totalRefund')}</div>
                                            <div className={`text-xs font-bold ${hasRefund ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                                {hasRefund
                                                    ? formatCurrency(convertPrice(refundAmt, refundCurr), displayCurrency)
                                                    : t('flightBookingCard.noRefund')}
                                            </div>
                                            {(booking.refund_penalty_amount ?? 0) > 0 && (
                                                <div className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">
                                                    {t('flightBookingCard.penaltyApplied', { amount: formatCurrency(convertPrice(booking.refund_penalty_amount!, booking.refund_currency || 'USD'), displayCurrency) })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                            {/* Airline details button — desktop. Mystifly-only, so it is
                                empty for every Duffel booking; hidden when so, for the same
                                reason as the block above. */}
                            <div className="hidden md:flex flex-col gap-1.5 w-full empty:hidden">
                                {isMystifly && booking.pnr && (<>
                                    <button
                                        onClick={handleViewTripDetails}
                                        className="flex w-full items-center justify-center gap-1 text-[10px] font-medium text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg px-2 py-1.5 transition-colors"
                                    >
                                        <Plane className="w-3 h-3" />
                                        {showTripDetails ? t('flightBookingCard.hideDetails') : t('flightBookingCard.airlineDetails')}
                                        {showTripDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                    </button>
                                    {localStatus === 'ticketed' && (<>
                                        {fareEligibility === null || fareEligibility.isVoidable ? (
                                            <button
                                                onClick={handleVoidQuote}
                                                className="flex w-full items-center justify-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg px-2 py-1.5 transition-colors"
                                            >
                                                {loadingVoidQuote ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                                                {showVoidQuote ? t('flightBookingCard.hideVoidQuote') : t('flightBookingCard.voidQuote')}
                                                {!loadingVoidQuote && (showVoidQuote ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                            </button>
                                        ) : (
                                            <div className="flex w-full items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 cursor-default">
                                                <XCircle className="w-3 h-3 shrink-0" />
                                                <span>{t('flightBookingCard.voidNotAvailable')}</span>
                                            </div>
                                        )}
                                        {fareEligibility === null || fareEligibility.isRefundable || isDuffel ? (
                                            <button
                                                onClick={handleRefundQuote}
                                                className="flex w-full items-center justify-center gap-1 text-[10px] font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg px-2 py-1.5 transition-colors"
                                            >
                                                {['quoting', 'accepting'].includes(refundStep) ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                                                {showRefundQuote ? t('flightBookingCard.hideRefundQuote') : t('flightBookingCard.refundQuote')}
                                                {!['quoting', 'accepting'].includes(refundStep) && (showRefundQuote ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                            </button>
                                        ) : (
                                            <div className="flex w-full items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 cursor-default">
                                                <XCircle className="w-3 h-3 shrink-0" />
                                                <span>{t('flightBookingCard.refundNotAvailable')}</span>
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
                                            {showReissue ? t('flightBookingCard.hideChangeFlight') : t('flightBookingCard.changeFlight')}
                                            {showReissue ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                        </button>
                                    )}
                                </>)}
                            </div>
                        </div>

                        {/* Cancelling sits at the foot of the column, away from the figures
                            and the links above it: an action that cannot be undone should
                            not share an edge with one clicked out of habit. No rule above
                            it — the design gives this column one edge, the divider.
                            empty:hidden so a booking with nothing to cancel leaves no
                            padded gap behind. */}
                        <div className="px-5 pb-5 pt-3 empty:hidden">
                            {(localStatus === 'cancel_failed' || localStatus === 'refund_failed') ? (
                                /* ── Cancel/Refund Failed: prominent retry block ── */
                                <div className="w-full rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-2 space-y-1.5">
                                    <div className="flex items-center gap-1 text-[10px] font-semibold text-red-600 dark:text-red-400">
                                        <XCircle className="w-3 h-3 shrink-0" />
                                        {localStatus === 'cancel_failed' ? t('flightBookingCard.cancellationFailed') : t('flightBookingCard.refundFailed')}
                                    </div>
                                    <button
                                        onClick={() => setShowCancelModal(true)}
                                        className="w-full text-[10px] font-semibold bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white rounded px-2 py-1.5 transition-colors flex items-center justify-center gap-1"
                                    >
                                        <RotateCcw className="w-3 h-3" />
                                        {t('flightBookingCard.retry')}
                                    </button>
                                </div>
                            ) : (
                                <>
                                    {/* Cancel button — only for upcoming, cancellable bookings (non-failed) */}
                                    {canCancel && !['cancel_failed', 'refund_failed'].includes(localStatus as string) && (
                                        <button
                                            onClick={() => setShowCancelModal(true)}
                                            className="w-full text-[10px] font-medium text-red-500 dark:text-red-400 hover:text-white border border-red-200 dark:border-red-800 hover:bg-red-500 dark:hover:bg-red-600 rounded-lg px-2 py-1.5 transition-all duration-200 flex items-center justify-center gap-1"
                                        >
                                            <RotateCcw className="w-3 h-3" />
                                            {t('flightBookingCard.cancelBooking')}
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Flight itinerary toggle (shared mobile + desktop, all providers) ──
                    A compact control that hugs its text, caret first, under the rule that
                    closes the summary off.

                    While the card is closed that rule stops where the price column begins
                    and the column's own divider carries on past it to the card's edge, as
                    the design draws it. Opening the card hands the full width to the
                    journey, so the rule runs the whole way across and the divider ends
                    with the summary above it. */}
                {segments.length > 0 && (
                    <div className="flex">
                        <div className="flex-1 min-w-0 px-5 py-3 border-t border-slate-100 dark:border-slate-800">
                            <button
                                onClick={() => setShowFlightItinerary(v => !v)}
                                aria-expanded={showFlightItinerary}
                                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            >
                                <ChevronDown
                                    aria-hidden="true"
                                    className={`w-3.5 h-3.5 transition-transform duration-300 ${showFlightItinerary ? 'rotate-180' : ''}`}
                                />
                                {showFlightItinerary ? t('flightBookingCard.hideFlightItinerary') : t('flightBookingCard.flightItinerary')}
                            </button>
                        </div>
                        {!showFlightItinerary && (
                            <div className="hidden md:block w-[220px] shrink-0 border-l border-slate-100 dark:border-slate-800" />
                        )}
                    </div>
                )}
                {/* The journey slides out from under the rule rather than appearing whole.
                    Height is animated because that is what a disclosure actually changes;
                    the easing is a quint ease-out, so it settles rather than bounces. */}
                <AnimatePresence initial={false}>
                    {showFlightItinerary && bookingOffer && (
                        <motion.div
                            key="flight-itinerary"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                            className="overflow-hidden"
                        >
                            {/* Padding sits inside the animated box: on the box itself it
                                would keep a gap open at zero height. */}
                            <div className="px-5 pb-5">
                                {/* The same component the search card and the book page draw
                                    a journey with, fed from bookingToFlightOffer() — one
                                    description of the flight instead of a second one that
                                    can drift from it. */}
                                <FlightItineraryDetails offer={bookingOffer} />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── Trip Details Panel (shared mobile + desktop) ── */}
                {showTripDetails && (
                    <div className="border-t border-slate-100 dark:border-slate-800 px-3 lg:px-5 py-3">
                        {loadingTripDetails && (
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('flightBookingCard.loadingTripDetails')}
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
                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">{t('flightBookingCard.bookingNotes')}</p>
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
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">{t('flightBookingCard.addBookingNote')}</p>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={noteText}
                                    onChange={e => { setNoteText(e.target.value); setNoteSuccess(false); setNoteError(null); }}
                                    onKeyDown={e => e.key === 'Enter' && handleAddNote()}
                                    placeholder={t('flightBookingCard.notePlaceholder')}
                                    className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                />
                                <button
                                    onClick={handleAddNote}
                                    disabled={submittingNote || !noteText.trim()}
                                    className="shrink-0 text-[10px] font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 flex items-center gap-1 transition-colors"
                                >
                                    {submittingNote ? <Loader2 className="w-3 h-3 animate-spin" /> : t('flightBookingCard.save')}
                                </button>
                            </div>
                            {noteSuccess && <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> {t('flightBookingCard.noteAdded')}</p>}
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
                                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{t('flightBookingCard.passengersHeading')}</p>
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
                                                                                        <span className="text-slate-500">{t('flightBookingCard.ticketDetails.grandTotal')}</span>
                                                                                        <span className="font-semibold text-slate-800 dark:text-slate-200">{tktData.GrandTotal} {tktData.GrandTotalCurrency}</span>
                                                                                    </div>
                                                                                )}
                                                                                {tktData.TotalFare && (
                                                                                    <div className="flex gap-2">
                                                                                        <span className="text-slate-500">{t('flightBookingCard.ticketDetails.totalFare')}</span>
                                                                                        <span className="text-slate-700 dark:text-slate-300">{tktData.TotalFare} {tktData.TotalTaxCurrency}</span>
                                                                                    </div>
                                                                                )}
                                                                                {tktData.FareCalculationLine && (
                                                                                    <div>
                                                                                        <span className="text-slate-500 block mb-0.5">{t('flightBookingCard.ticketDetails.fareCalc')}</span>
                                                                                        <span className="font-mono text-slate-600 dark:text-slate-400 break-all">{tktData.FareCalculationLine}</span>
                                                                                    </div>
                                                                                )}
                                                                                {tktData.EndorsementRestrictions && (
                                                                                    <div className="flex gap-2">
                                                                                        <span className="text-slate-500 shrink-0">{t('flightBookingCard.ticketDetails.endorsements')}</span>
                                                                                        <span className="text-slate-700 dark:text-slate-300">{tktData.EndorsementRestrictions}</span>
                                                                                    </div>
                                                                                )}
                                                                                {Array.isArray(tktData.ItineraryDetails) && tktData.ItineraryDetails.length > 0 && (
                                                                                    <div>
                                                                                        <span className="text-slate-500 block mb-0.5">{t('flightBookingCard.ticketDetails.itinerary')}</span>
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
                                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{t('flightBookingCard.passengersHeading')}</p>
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
                                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{tm('segments')}</p>
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
                                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{tm('pricing')}</p>
                                                <div className="flex gap-4 text-slate-600 dark:text-slate-400">
                                                    <span>{tm('total')} <strong className="text-slate-800 dark:text-slate-200">{totalFare.Amount} {totalFare.CurrencyCode}</strong></span>
                                                </div>
                                            </div>
                                        )
                                    ) : (
                                        legacyPricing && (
                                            <div>
                                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{tm('pricing')}</p>
                                                <div className="flex gap-4 text-slate-600 dark:text-slate-400">
                                                    {legacyPricing.TotalFare && <span>{tm('total')} <strong className="text-slate-800 dark:text-slate-200">{legacyPricing.TotalFare} {legacyPricing.CurrencyCode}</strong></span>}
                                                    {legacyPricing.BaseFare && <span>{tm('base')} {legacyPricing.BaseFare}</span>}
                                                    {legacyPricing.Taxes && <span>{tm('taxes')} {legacyPricing.Taxes}</span>}
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
                        <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-2">{t('flightBookingCard.voidQuote')}</p>
                        {loadingVoidQuote && (
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" /> {tm('fetchingVoidQuote')}
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
                                        <span>{tm('status')} <strong className="text-slate-800 dark:text-slate-200">{voidQuoteData.ptrStatus}</strong></span>
                                    )}
                                    {voidQuoteData.voidingWindow && (
                                        <span>{tm('voidWindow')} <strong className="text-slate-800 dark:text-slate-200">{new Date(voidQuoteData.voidingWindow).toLocaleString()}</strong></span>
                                    )}
                                    {voidQuoteData.slaMinutes > 0 && (
                                        <span>{tm('sla')} <strong className="text-slate-800 dark:text-slate-200">{tm('minutes', { count: voidQuoteData.slaMinutes })}</strong></span>
                                    )}
                                </div>
                                {voidQuoteData.voidQuotes?.length > 0 && (
                                    <div>
                                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{tm('refundBreakdown')}</p>
                                        <div className="space-y-1">
                                            {voidQuoteData.voidQuotes.map((q: any, i: number) => {
                                                // RefundDetails fields per Mystifly doc: TotalRefund, CancellationCharge, AdminFee
                                                // Passenger identity comes from TicketNumber + PassengerType (no name fields)
                                                const refundAmt = q.TotalRefund ?? q.TotalRefundAmount;
                                                const fee = Number(q.CancellationCharge ?? q.TotalVoidingFee ?? 0) + Number(q.AdminFee ?? q.AdminCharges ?? 0);
                                                const label = [q.TicketNumber, q.PassengerType].filter(Boolean).join(' · ');
                                                return (
                                                    <div key={i} className="flex items-center justify-between gap-2 bg-white dark:bg-slate-800/60 rounded-lg px-2.5 py-2 border border-amber-100 dark:border-amber-800/30">
                                                        <span className="text-slate-700 dark:text-slate-300 font-mono text-[10px]">{label || tm('paxNumber', { number: i + 1 })}</span>
                                                        <div className="text-right shrink-0">
                                                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">{refundAmt ?? '—'} {q.Currency}</span>
                                                            {fee > 0 && (
                                                                <p className="text-[10px] text-slate-400">{tm('fee')} {fee} {q.Currency}</p>
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
                                        {tm('voidSubmitted', {
                                            ptr: voidResult.ptrId ?? '—',
                                            window: voidResult.slaMinutes > 0 ? tm('minutes', { count: voidResult.slaMinutes }) : tm('slaWindow'),
                                        })}
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
                                            {confirmingVoid ? tm('processingVoid') : tm('confirmVoid')}
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
                        <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-2">{t('flightBookingCard.refundQuote')}</p>

                        {refundStep === 'quoting' && (
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                {tm('requestingRefundQuote')}
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
                                {tm('refundAccepted', { ptr: refundPtrId ?? '—' })}
                            </div>
                        ) : (refundStep === 'got' || refundStep === 'accepting') && refundQuoteData ? (
                            <div className="space-y-2 text-xs">
                                {refundQuoteData.ptrFee > 0 && (
                                    <div className="flex flex-wrap gap-3 text-slate-600 dark:text-slate-400">
                                        <span>{tm('ptrFee')} <strong className="text-slate-800 dark:text-slate-200">{refundQuoteData.ptrFee}</strong></span>
                                        <span>{tm('ptrId')} <strong className="font-mono text-slate-800 dark:text-slate-200">{refundPtrId}</strong></span>
                                    </div>
                                )}

                                {refundQuoteData.passengerChanges?.length > 0 && (
                                    <div>
                                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{tm('refundBreakdown')}</p>
                                        <div className="space-y-1">
                                            {refundQuoteData.passengerChanges.map((p: any, i: number) => {
                                                // RefundDetails fields per Mystifly doc: TotalRefund, CancellationCharge
                                                // Passenger identity: TicketNumber + PassengerType (no name fields in RefundDetails)
                                                const refundAmt = p.TotalRefund ?? p.TotalRefundAmount;
                                                const penalty = Number(p.CancellationCharge ?? p.TotalPenalty ?? 0);
                                                const label = [p.TicketNumber, p.PassengerType].filter(Boolean).join(' · ');
                                                return (
                                                    <div key={i} className="flex items-center justify-between gap-2 bg-white dark:bg-slate-800/60 rounded-lg px-2.5 py-2 border border-blue-100 dark:border-blue-800/30">
                                                        <span className="text-slate-700 dark:text-slate-300 font-mono text-[10px]">{label || tm('paxNumber', { number: i + 1 })}</span>
                                                        <div className="text-right shrink-0">
                                                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">{refundAmt ?? '—'} {p.Currency}</span>
                                                            {penalty > 0 && (
                                                                <p className="text-[10px] text-slate-400">{tm('penalty')} {penalty} {p.Currency}</p>
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
                                        {(['accepting'] as string[]).includes(refundStep) ? tm('processingRefund') : tm('acceptRefund')}
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </div>
                )}

                {/* ── Reissue / Change Flight Panel ── */}
                {showReissue && (
                    <div className="border-t border-violet-100 dark:border-violet-900/30 px-3 lg:px-5 py-3 bg-violet-50/40 dark:bg-violet-900/10">
                        <p className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wide mb-2">{tm('reissueTitle')}</p>
                        {reissueStep === 'accepted' ? (
                            <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-3 py-2 border border-emerald-200 dark:border-emerald-800/40">
                                <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                                {tm('reissueSubmitted')}
                            </div>
                        ) : (
                            <div className="space-y-3 text-xs">
                                {/* Segment editors */}
                                <div className="space-y-2">
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{tm('newFlightDetails')}</p>
                                    {reissueNewSegments.map((seg, i) => (
                                        <div key={i} className="bg-white dark:bg-slate-800/60 rounded-lg px-2.5 py-2.5 border border-violet-100 dark:border-violet-800/30 space-y-2">
                                            <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                                {seg.label}: {seg.originLocationCode} → {seg.destinationLocationCode}
                                            </p>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="col-span-2">
                                                    <label className="text-[10px] text-slate-400 block mb-0.5">{tm('newDepartureDate')}</label>
                                                    <FormDatePicker
                                                        value={seg.departureDate}
                                                        onChange={val => setReissueNewSegments(prev => prev.map((s, idx) => idx === i ? { ...s, departureDate: val } : s))}
                                                        className="h-8 bg-slate-50 dark:bg-slate-700"
                                                        placeholder={tm('selectNewDate')}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-slate-400 block mb-0.5">{tm('airlineCode')}</label>
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
                                                    <label className="text-[10px] text-slate-400 block mb-0.5">{tm('cabin')}</label>
                                                    <select
                                                        value={seg.cabinPreference}
                                                        onChange={e => setReissueNewSegments(prev => prev.map((s, idx) => idx === i ? { ...s, cabinPreference: e.target.value } : s))}
                                                        className="w-full text-xs bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md px-2 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-400"
                                                    >
                                                        <option value="Y">{tm('cabinY')}</option>
                                                        <option value="C">{tm('cabinC')}</option>
                                                        <option value="F">{tm('cabinF')}</option>
                                                        <option value="S">{tm('cabinS')}</option>
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
                                        {reissueStep === 'quoting' ? tm('gettingQuote') : tm('getReissueQuote')}
                                    </button>
                                )}

                                {/* Quote result */}
                                {reissueQuoteData && (reissueStep === 'got' || reissueStep === 'accepting') && (
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap gap-3 text-slate-600 dark:text-slate-400">
                                            {reissueQuoteData.priceChange != null && (
                                                <span>{tm('priceChange')} <strong className={reissueQuoteData.priceChange >= 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}>
                                                    {reissueQuoteData.priceChange >= 0 ? '+' : ''}{reissueQuoteData.priceChange}
                                                </strong></span>
                                            )}
                                        </div>
                                        {reissueQuoteData.passengerChanges?.length > 0 && (
                                            <div>
                                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{tm('changeBreakdown')}</p>
                                                <div className="space-y-1">
                                                    {reissueQuoteData.passengerChanges.map((p: any, i: number) => {
                                                        const changeAmt = p.PriceChange ?? p.TotalChange ?? p.TotalFare;
                                                        const label = [p.TicketNumber, p.PassengerType].filter(Boolean).join(' · ');
                                                        return (
                                                            <div key={i} className="flex items-center justify-between gap-2 bg-white dark:bg-slate-800/60 rounded-lg px-2.5 py-2 border border-violet-100 dark:border-violet-800/30">
                                                                <span className="text-slate-700 dark:text-slate-300 font-mono text-[10px]">{label || tm('paxNumber', { number: i + 1 })}</span>
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
                                                {reissueStep === 'accepting' ? tm('processingChange') : tm('confirmChange')}
                                            </button>
                                            <button
                                                onClick={() => { setReissueStep('idle'); setReissueQuoteData(null); setReissueError(null); }}
                                                className="w-full text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 py-1 transition-colors"
                                            >
                                                {tm('editAndRequote')}
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
