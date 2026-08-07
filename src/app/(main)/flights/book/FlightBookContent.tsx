"use client";

import React, { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { Plane, User, Mail, Loader2, CheckCircle, AlertTriangle, MapPin, PartyPopper, Info, Clock, Shield, XCircle, X, BadgeDollarSign, RefreshCw, Users, BedDouble, ArrowRight, Armchair, Luggage, Sparkles, ChevronDown } from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import BackButton from '@/components/common/BackButton';
import StripeEmbeddedCheckout from '@/components/checkout/StripeEmbeddedCheckout';
import { Confetti, Balloons } from '@/components/ui/Animations';
import { formatTime, formatDuration, formatPrice } from '@/utils/flight-utils';
import { useFlightBooking } from '@/hooks/flights/useFlightBooking';
import { useUserCurrency } from '@/stores/searchStore';
import type { FarePolicy } from '@/types/flights';
import { getAirportInfo } from '@/utils/airport-info';
import { getAirportByCode } from '@/lib/airports';
import { FareRulesPanel } from './FareRulesPanel';
import SeatMapPanel from '@/components/flights/SeatMapPanel';
import { DuplicateBookingModal } from '@/components/flights/DuplicateBookingModal';
import BagSelectionPanel from '@/components/flights/BagSelectionPanel';
import DuffelFareConditions from '@/components/flights/DuffelFareConditions';
import PriceCalendar from '@/components/flights/PriceCalendar';
import { Suspense, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FormDatePicker } from '@/components/common/FormDatePicker';
import { } from 'zod';

// ─── Inline field validation ─────────────────────────────────────────

/** Shared input styling, so the error variant only has to override the border. */
const FIELD_BASE =
    'w-full px-2.5 lg:px-3 py-2 lg:py-2.5 rounded-md border bg-white dark:bg-slate-800 ' +
    'text-slate-900 dark:text-white text-[10px] lg:text-[13px] placeholder:text-slate-400 ' +
    'focus:outline-none focus:ring-2';

/** Border + focus ring for an input, red when that field failed validation. */
function fieldClass(hasError: boolean, extra = ''): string {
    return cn(
        FIELD_BASE,
        hasError
            ? 'border-red-400 dark:border-red-500 focus:ring-red-500/50 focus:border-red-500'
            : 'border-slate-200 dark:border-slate-700 focus:ring-indigo-500/50 focus:border-indigo-500',
        extra,
    );
}

/**
 * One field's complaint, rendered directly beneath its input.
 *
 * `role="alert"` so screen readers announce it when it appears — the message arrives
 * after submit, long after the input was read.
 */
function FieldError({ message }: { message?: string }) {
    if (!message) return null;
    return (
        // Rendered ABOVE its input, so the complaint is read before the value it
        // is about — and so a long message pushes the field down rather than
        // shifting whatever follows it.
        <p role="alert" className="mb-1 text-[10px] lg:text-[11px] text-red-600 dark:text-red-400">
            {message}
        </p>
    );
}

// ─── Date-of-birth picker default ────────────────────────────────────

/**
 * Typical age of an adult passenger. Opening the birthdate calendar on today
 * means paging back three decades before reaching a plausible year.
 */
const TYPICAL_ADULT_AGE = 30;

/**
 * Month the birthdate calendar opens on. Relative rather than a fixed year, so
 * it stays sensible as time passes — a hardcoded 1996 would quietly become a
 * worse guess every year. Today that resolves to 1996.
 */
function defaultBirthdateView(): Date {
    const now = new Date();
    return new Date(now.getFullYear() - TYPICAL_ADULT_AGE, 0, 1);
}

// ─── Error codes ─────────────────────────────────────────────────────

/**
 * Error codes we have traveller-facing copy for, under `flightBook.error.codes`.
 *
 * Codes arrive as `CODE:<code>` in errorMsg — some from the API's `errorCode`
 * field, some from thrown Errors — so the incoming set is open-ended and a
 * lookup on an unknown code would render next-intl's fallback (the key path
 * itself) straight into the UI.
 */
const TRANSLATED_ERROR_CODES = new Set([
    'balance_insufficient',
    'booking_failed',
    'booking_failed_refunded',
    'booking_pending',
    'booking_timeout',
    // Normally handled by the duplicate panel on the form step; this covers a
    // DUPLICATE_BOOKING response that arrives without the booking payload.
    'duplicate_booking',
    'flight_unavailable',
    'offer_expired',
    'offer_replaced_seats_cleared',
    'pending',
    'phone_number_invalid',
    'seats_unavailable',
    'server_error',
    'supplier_outage',
    'unauthenticated',
]);

type FlightBookTranslator = ReturnType<typeof useTranslations<'flightBook'>>;

/** Copy for an error code, or the generic line when the code is unrecognised. */
function messageForCode(t: FlightBookTranslator, code: string, fallbackKey = 'error.defaultMessage'): string {
    return TRANSLATED_ERROR_CODES.has(code)
        ? t(`error.codes.${code}` as Parameters<FlightBookTranslator>[0])
        : t(fallbackKey as Parameters<FlightBookTranslator>[0]);
}

// ─── Fare Policy Panel ───────────────────────────────────────────────

interface FarePolicyPanelProps {
    policy: FarePolicy;
    policyChanged?: boolean;
}

function FarePolicyPanel({ policy, policyChanged }: FarePolicyPanelProps) {
    const t = useTranslations('flightBook');
    const isRefundable = policy.isRefundable;
    const penalty = policy.refundPenaltyAmount;
    const isLocked = policy.policyVersion === 'revalidated';

    let badge: React.ReactNode;
    if (isRefundable && penalty === 0) {
        badge = (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-normal bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                <Shield className="w-3 h-3" /> {t('farePolicy.freeCancellation')}
            </span>
        );
    } else if (isRefundable) {
        const feeLabel = penalty != null && penalty > 0
            ? t('farePolicy.refundableFee', { fee: `${policy.refundPenaltyCurrency ?? ''}${penalty}` })
            : t('farePolicy.refundableFeesMayApply');
        badge = (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-normal bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400">
                <BadgeDollarSign className="w-3 h-3" /> {feeLabel}
            </span>
        );
    } else {
        badge = (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-normal bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400">
                <XCircle className="w-3 h-3" /> {t('farePolicy.nonRefundable')}
            </span>
        );
    }

    return (
        <div className="bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-700 p-3 lg:p-5 mb-3 lg:mb-6 shadow-sm space-y-2">
            {/* Policy downgrade warning */}
            {policyChanged && (
                <div className="flex items-center gap-2 p-2.5 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-[11px]">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span dangerouslySetInnerHTML={{ __html: t.raw('farePolicy.policyUpdated') }} />
                </div>
            )}
            <div className="flex items-center justify-between">
                <h3 className="text-[11px] lg:text-xs font-normal text-slate-900 dark:text-white flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 text-indigo-500" />
                    {t('farePolicy.title')}
                </h3>
                {isLocked && (
                    <span className="text-[9px] lg:text-[11px] text-emerald-600 dark:text-emerald-400 font-normal">{t('farePolicy.airlineConfirmed')}</span>
                )}
            </div>
            <div className="flex flex-wrap gap-1.5 items-center">
                {badge}
                {policy.isChangeable && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-normal bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400">
                        {t('farePolicy.changesAllowed')}
                    </span>
                )}
            </div>
            <p className="text-[9px] lg:text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
                {isLocked
                    ? t('farePolicy.finalRules')
                    : t('farePolicy.indicativeOnly')}
            </p>
        </div>
    );
}

// ─── Component ───────────────────────────────────────────────────────


// ─── Offer expiry countdown ──────────────────────────────────────────

function useCountdown(expiresAt: Date | null) {
    const [secsLeft, setSecsLeft] = React.useState<number | null>(null);
    useEffect(() => {
        if (!expiresAt) return;
        const tick = () => setSecsLeft(Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)));
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [expiresAt]);
    return secsLeft;
}

function OfferExpiryBanner({ expiresAt }: { expiresAt: Date }) {
    const t = useTranslations('flightBook');
    const secsLeft = useCountdown(expiresAt);
    if (secsLeft === null || secsLeft > 10 * 60) return null;
    const mins = Math.floor(secsLeft / 60);
    const secs = secsLeft % 60;
    const isUrgent = secsLeft < 2 * 60;
    return (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-md text-[11px] font-normal mb-3 lg:mb-6 border ${isUrgent
            ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
            : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
            }`}>
            <Clock className="w-3.5 h-3.5 shrink-0" />
            {secsLeft === 0
                ? t('offerExpiry.expired')
                : t('offerExpiry.expiresIn', { time: `${mins}:${String(secs).padStart(2, '0')}` })}
        </div>
    );
}

function AncillaryExpiredNotice() {
    const t = useTranslations('flightBook');
    return (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <p className="text-xs font-normal text-slate-700 dark:text-slate-300">{t('ancillaryExpired.title')}</p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
                {t('ancillaryExpired.description')}
            </p>
        </div>
    );
}

const FLIGHT_BOOKING_STEPS = [
    'Verifying payment...',
    'Securing your seat...',
    'Confirming with the airline...',
    'Finalizing booking details...',
] as const;

const PASSENGER_TYPES = [
    { code: 'ADT', label: 'Adult' },
    { code: 'CHD', label: 'Child' },
    { code: 'INF', label: 'Infant' },
];

const GENDERS = [
    { value: 'M', label: 'Male' },
    { value: 'F', label: 'Female' },
];

const NATIONALITIES = [
    { code: 'KR', name: 'South Korea' },
    { code: 'PH', name: 'Philippines' },
    { code: 'US', name: 'United States' },
    { code: 'JP', name: 'Japan' },
    { code: 'CN', name: 'China' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'AU', name: 'Australia' },
    { code: 'CA', name: 'Canada' },
    { code: 'DE', name: 'Germany' },
    { code: 'FR', name: 'France' },
    { code: 'SG', name: 'Singapore' },
    { code: 'TH', name: 'Thailand' },
    { code: 'VN', name: 'Vietnam' },
    { code: 'IN', name: 'India' },
    { code: 'MY', name: 'Malaysia' },
];

const PHONE_CODES = [
    { code: '82', country: 'KR', label: '+82 (KR)' },
    { code: '63', country: 'PH', label: '+63 (PH)' },
    { code: '1', country: 'US', label: '+1 (US/CA)' },
    { code: '81', country: 'JP', label: '+81 (JP)' },
    { code: '86', country: 'CN', label: '+86 (CN)' },
    { code: '44', country: 'GB', label: '+44 (GB)' },
    { code: '61', country: 'AU', label: '+61 (AU)' },
    { code: '49', country: 'DE', label: '+49 (DE)' },
    { code: '33', country: 'FR', label: '+33 (FR)' },
    { code: '65', country: 'SG', label: '+65 (SG)' },
    { code: '66', country: 'TH', label: '+66 (TH)' },
    { code: '84', country: 'VN', label: '+84 (VN)' },
    { code: '91', country: 'IN', label: '+91 (IN)' },
    { code: '60', country: 'MY', label: '+60 (MY)' },
];

function BookingContent() {
    const t = useTranslations('flightBook');
    const [bookingStepIdx, setBookingStepIdx] = React.useState(0);
    const bookingStepTimer = React.useRef<ReturnType<typeof setInterval> | null>(null);
    const [showSuccess, setShowSuccess] = React.useState(false);

    const {
        offer,
        offerExpiresAt,
        step,
        errorMsg,
        fieldErrors,
        clearFieldError,
        validateField,
        bookingResult,
        passengers,
        contact,
        updatePassenger,
        addPassenger,
        removePassenger,
        setContact,
        handleSubmit,
        confirmPriceChange,
        priceChangedData,
        duplicateBookingData,
        dismissDuplicateWarning,
        selectedSeats,
        setSelectedSeats,
        selectedBags,
        setSelectedBags,
        router,
        clientSecret,
        setStep,
        pollForBooking,
        setErrorMsg,
    } = useFlightBooking();

    // ─── Price Calendar Props ──────────────────────────────────────────
    const calendarProps = useMemo(() => {
        if (!offer || !offer.segments) return null;

        const searchCounts = typeof window !== 'undefined' ? sessionStorage.getItem('flightSearchPassengers') : null;
        let adultsCount = 1;
        if (searchCounts) {
            try {
                const { adults = 1 } = JSON.parse(searchCounts);
                adultsCount = adults;
            } catch { }
        }

        const outboundSegments = offer.segments.filter((s: any) => (s.segmentIndex ?? 0) === 0);
        const returnSegments = offer.segments.filter((s: any) => (s.segmentIndex ?? 0) === 1);

        if (!outboundSegments.length) return null;

        const origin = outboundSegments[0].departure.airport;
        const destination = outboundSegments[outboundSegments.length - 1].arrival.airport;
        const departureDate = outboundSegments[0].departure.time?.slice(0, 10) || '';
        const returnDate = returnSegments.length > 0 ? returnSegments[0].departure.time?.slice(0, 10) : undefined;

        const primary = offer.segments[0];

        return {
            origin,
            destination,
            adults: adultsCount,
            cabin: primary.cabinClass || 'economy',
            initialDate: departureDate,
            returnDate,
            provider: offer.provider
        };
    }, [offer]);

    const [bagsOpen, setBagsOpen] = React.useState(false);
    const [seatsOpen, setSeatsOpen] = React.useState(false);
    const [refreshingOffer, setRefreshingOffer] = React.useState(false);
    const [refreshFailed, setRefreshFailed] = React.useState(false);
    const [currentOfferId, setCurrentOfferId] = React.useState<string | null>(null);
    const refreshAttempted = React.useRef(false);

    const effectiveOfferId = currentOfferId
        ?? (offer as any)?.raw?.id
        ?? (offer as any)?._rawOffer?.id
        ?? offer?.offerId
        ?? '';

    const refreshOffer = React.useCallback(async () => {
        // Only ever attempt once — prevents infinite loop on repeated 404s
        if (refreshAttempted.current) return;
        refreshAttempted.current = true;

        const rawOffer = (offer as any)?._rawOffer ?? (offer as any)?.raw;
        if (!rawOffer) { setRefreshFailed(true); return; }

        setRefreshingOffer(true);
        try {
            const res = await fetch('/api/flights/offer-refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
                body: JSON.stringify({ rawOffer }),
            });
            const data = await res.json();
            if (res.ok && data.success && data.newOfferId) {
                setCurrentOfferId(data.newOfferId);
                setSelectedBags([]);
                setSelectedSeats([]);
            } else {
                setRefreshFailed(true);
            }
        } catch {
            setRefreshFailed(true);
        } finally {
            setRefreshingOffer(false);
        }
    }, [offer, setSelectedBags, setSelectedSeats]);

    useEffect(() => {
        if (step === 'submitting') {
            setBookingStepIdx(0);
            setShowSuccess(false);
            bookingStepTimer.current = setInterval(() => {
                setBookingStepIdx(i => Math.min(i + 1, FLIGHT_BOOKING_STEPS.length - 1));
            }, 4000);
        } else if (step === 'success') {
            // API resolved — fast-forward the animation to the final step
            if (bookingStepTimer.current) {
                clearInterval(bookingStepTimer.current);
                bookingStepTimer.current = null;
            }
            setBookingStepIdx(FLIGHT_BOOKING_STEPS.length - 1);
        } else {
            if (bookingStepTimer.current) {
                clearInterval(bookingStepTimer.current);
                bookingStepTimer.current = null;
            }
        }
        return () => { if (bookingStepTimer.current) clearInterval(bookingStepTimer.current); };
    }, [step]);

    // Once animation reaches the last step AND booking is confirmed, reveal success after a brief pause
    useEffect(() => {
        if (step === 'success' && bookingStepIdx === FLIGHT_BOOKING_STEPS.length - 1) {
            const t = setTimeout(() => setShowSuccess(true), 800);
            return () => clearTimeout(t);
        }
    }, [step, bookingStepIdx]);
    const targetCurrency = useUserCurrency();
    const searchParams = useSearchParams();
    const isBundledWithHotel = searchParams.has('bundleHotelId');
    const [hasAlreadyBookedHotel, setHasAlreadyBookedHotel] = React.useState(false);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setHasAlreadyBookedHotel(sessionStorage.getItem('hasAlreadyBookedHotel') === 'true');
        }
    }, []);

    useEffect(() => {
        if (showSuccess && typeof window !== 'undefined') {
            sessionStorage.setItem('hasAlreadyBookedFlight', 'true');
        }
    }, [showSuccess]);

    // ─── Loading ─────────────────────────────────────────────────────

    if (!offer) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
        );
    }

    // ─── Post-Payment PNR Loading ─────────────────────────────────────
    // Shown after Stripe payment succeeds while we poll for the PNR from the webhook.
    // We stay in 'submitting' until the PNR arrives, then flip to 'success'.
    if ((step === 'submitting' || (step === 'success' && !showSuccess)) && clientSecret) {
        return (
            <main className="min-h-screen flex items-center justify-center bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-6 px-8 text-center max-w-xs">
                    <div className="w-16 h-16 rounded-full border-4 border-blue-100 dark:border-blue-900 border-t-blue-600 animate-spin" />
                    <div>
                        <h2 className="text-lg font-normal text-slate-900 dark:text-white mb-1">{t('confirmingBooking')}</h2>
                        <p className="text-[11px] text-blue-600 dark:text-blue-400 font-normal animate-pulse min-h-5">
                            {(t.raw('bookingSteps') as string[])[bookingStepIdx] || FLIGHT_BOOKING_STEPS[bookingStepIdx]}
                        </p>
                    </div>
                    <div className="w-full space-y-2">
                        {(t.raw('bookingSteps') as string[]).map((label, i) => (
                            <div key={i} className={`flex items-center gap-2 text-[11px] ${i <= bookingStepIdx ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-600'}`}>
                                <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[10px] font-normal ${i < bookingStepIdx ? 'bg-green-500 text-white' : i === bookingStepIdx ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'}`}>
                                    {i < bookingStepIdx ? '✓' : i + 1}
                                </span>
                                {label}
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{t('dontClosePage')}</p>
                </div>
            </main>
        );
    }

    const primary = offer.segments[0];
    const last = offer.segments[offer.segments.length - 1];

    // ─── Booking Failed State ─────────────────────────────────────────

    if (step === 'error') {
        const errorCode = errorMsg?.startsWith('CODE:') ? errorMsg.slice(5) : null;
        const isPending = ['pending', 'booking_pending'].includes(errorCode ?? '');
        const isRefunded = errorCode === 'booking_failed_refunded';
        const isExpired = errorCode === 'flight_unavailable' || errorCode === 'offer_expired';
        // Codes come from the API and from thrown Errors, so the set is open-ended.
        // Only render a code we have copy for — anything else (including a raw
        // exception message that reached this far) falls back to the generic line
        // rather than leaking an internal string into the failure screen.
        const displayMsg = errorCode
            ? messageForCode(t, errorCode)
            : (errorMsg || t('error.defaultMessage'));
        return (
            <main className="min-h-screen flex items-center justify-center bg-linier-to-br from-red-50/60 via-white/40 to-orange-50/60 dark:from-slate-950/60 dark:via-slate-900/40 dark:to-red-950/60 px-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.4, type: 'spring', bounce: 0.3 }}
                    className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-6 lg:p-10 rounded-md shadow-2xl max-w-md w-full text-center border border-white/50 dark:border-white/10"
                >
                    <div className={`w-16 h-16 mx-auto mb-5 rounded-full flex items-center justify-center shadow-lg ${isPending ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                        {isPending
                            ? <Clock className="w-8 h-8 text-amber-600 dark:text-amber-400" />
                            : <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
                        }
                    </div>
                    <h1 className="text-xl font-normal text-slate-900 dark:text-white mb-2">
                        {isPending ? t('error.flightUnavailable') : t('error.bookingFailed')}
                    </h1>
                    <p className={`text-[11px] mb-2 ${isPending ? 'text-amber-700 dark:text-amber-400' : 'text-red-700 dark:text-red-400'}`}>
                        {displayMsg}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
                        {isRefunded
                            ? t('error.notChargedShort')
                            : <span dangerouslySetInnerHTML={{ __html: t.raw('error.notCharged') }} />
                        }
                    </p>
                    {/* Only show Try Again if the error happened before payment was taken */}
                    {!isRefunded && !isExpired && (
                        <button
                            onClick={() => setStep('form')}
                            className="w-full mb-2 py-2.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-normal text-[11px] transition-colors"
                        >
                            {t('error.tryAgain')}
                        </button>
                    )}
                    <button
                        onClick={() => router.push('/flights/search')}
                        className="w-full py-2.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-normal text-[11px] hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                        {t('error.searchAgain')}
                    </button>
                    <button
                        onClick={() => router.back()}
                        className="w-full mt-2 py-2.5 text-slate-400 dark:text-slate-500 font-normal text-xs hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                    >
                        {t('error.goBack')}
                    </button>
                </motion.div>
            </main>
        );
    }

    // ─── Success State ───────────────────────────────────────────────

    if (showSuccess && bookingResult) {

        return (
            <main className="min-h-screen pt-6 lg:pt-24 pb-20 px-3 lg:px-4 flex items-center justify-center relative overflow-hidden bg-linear-to-br from-emerald-50/60 via-white/40 to-indigo-50/60 dark:from-slate-950/60 dark:via-slate-900/40 dark:to-emerald-950/60">
                {/* Celebration Effects */}
                <Confetti count={80} />
                <Balloons count={12} />

                {/* Animated background circles */}
                <motion.div
                    className="absolute top-20 left-10 w-72 h-72 bg-emerald-300/20 dark:bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"
                    animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
                    transition={{ duration: 4, repeat: Infinity }}
                />
                <motion.div
                    className="absolute bottom-20 right-10 w-96 h-96 bg-indigo-300/20 dark:bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"
                    animate={{ scale: [1.2, 1, 1.2], opacity: [0.3, 0.5, 0.3] }}
                    transition={{ duration: 5, repeat: Infinity }}
                />

                <motion.div
                    initial={{ opacity: 0, scale: 0.8, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.5, type: 'spring', bounce: 0.4 }}
                    className="relative z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-5 lg:p-8 rounded-md lg:rounded-md shadow-2xl max-w-md w-full text-center border border-white/50 dark:border-white/10"
                >
                    {/* Success Icon with Animation */}
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: 'spring', bounce: 0.6 }}
                        className="relative mx-auto mb-4 lg:mb-6 w-16 lg:w-20 flex justify-center"
                    >
                        <motion.div
                            className="w-16 h-16 lg:w-20 lg:h-20 bg-linier-to-br from-emerald-400 to-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/30"
                            animate={{ boxShadow: ['0 10px 30px rgba(16, 185, 129, 0.3)', '0 10px 50px rgba(16, 185, 129, 0.5)', '0 10px 30px rgba(16, 185, 129, 0.3)'] }}
                            transition={{ duration: 2, repeat: Infinity }}
                        >
                            <CheckCircle className="w-8 h-8 lg:w-10 lg:h-10 text-white" strokeWidth={2.5} />
                        </motion.div>
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.4, type: 'spring' }}
                            className="absolute -top-1 -right-1 w-8 h-8 bg-amber-400 rounded-full flex items-center justify-center shadow-md"
                        >
                            <PartyPopper size={16} className="text-amber-800" />
                        </motion.div>
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="text-lg lg:text-2xl font-normal text-slate-900 dark:text-white mb-1.5 lg:mb-2"
                    >
                        {t('success.bookingConfirmed')}
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        className="text-[11px] lg:text-sm text-slate-500 dark:text-slate-400 mb-4 lg:mb-6"
                    >
                        {isBundledWithHotel
                            ? t('success.bundleSuccess')
                            : t('success.flightSuccess')}
                    </motion.p>

                    {/* Booking Details Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                        className="bg-linier-to-br from-slate-50 to-slate-100 dark:from-white/5 dark:to-white/10 p-3.5 lg:p-5 rounded-xl lg:rounded-2xl mb-4 lg:mb-6 text-left border border-slate-200/50 dark:border-white/5 space-y-3 lg:space-y-4"
                    >
                        <div className="flex justify-between items-center pb-3 border-b border-slate-200 dark:border-white/10">
                            <span className="text-[9px] lg:text-xs text-slate-500 dark:text-slate-400">{t('success.pnr')}</span>
                            <span className="text-[9px] lg:text-xs font-mono font-normal text-slate-900 dark:text-white">{bookingResult.pnr}</span>
                        </div>
                        <div className="flex justify-between items-center pb-3 border-b border-slate-200 dark:border-white/10">
                            <span className="text-[9px] lg:text-xs text-slate-500 dark:text-slate-400">{t('success.bookingId')}</span>
                            <span className="text-[9px] lg:text-xs font-mono text-slate-700 dark:text-slate-300">{bookingResult.bookingId?.slice(0, 8) || 'N/A'}...</span>
                        </div>
                        <div className="flex justify-between items-center pb-3 border-b border-slate-200 dark:border-white/10">
                            <span className="text-[9px] lg:text-xs text-slate-500 dark:text-slate-400">{t('success.route')}</span>
                            <span className="text-[9px] lg:text-xs font-normal text-slate-900 dark:text-white">
                                {(() => {
                                    const outbound = offer.segments.filter((s: any) => (s.segmentIndex ?? 0) === 0);
                                    const dest = outbound[outbound.length - 1].arrival.airport;
                                    return (offer as any).tripType === 'round-trip'
                                        ? `${primary.departure.airport} ⇌ ${dest}`
                                        : `${primary.departure.airport} → ${last.arrival.airport}`;
                                })()}
                            </span>
                        </div>
                        <div className="flex justify-between items-center pb-3 border-b border-slate-200 dark:border-white/10">
                            <span className="text-[10px] lg:text-sm text-slate-500 dark:text-slate-400">{t('success.total')}</span>
                            <div className="flex flex-col items-end">
                                <span className="text-[10px] lg:text-sm font-normal text-slate-900 dark:text-white">
                                    {formatPrice(offer.price.total + selectedSeats.reduce((s, x) => s + x.price, 0) + selectedBags.reduce((s, b) => s + b.price, 0), offer.price.currency, targetCurrency)}
                                </span>
                                {isBundledWithHotel && (
                                    <span className="text-[9px] font-normal text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5">
                                        <Sparkles className="w-2.5 h-2.5" />
                                        {t('success.bundleDiscountApplied')}
                                    </span>
                                )}
                            </div>
                        </div>
                        {bookingResult.tickets && bookingResult.tickets.length > 0 && (
                            <div className="flex justify-between items-start pt-1">
                                <span className="text-[9px] lg:text-xs text-slate-500 dark:text-slate-400 mt-1">{t('success.eTickets')}</span>
                                <div className="flex flex-col items-end gap-1">
                                    {bookingResult.tickets.map((t, i) => (
                                        <div key={i} className="text-[10px] lg:text-sm flex items-center gap-2">
                                            <span className="text-slate-500 dark:text-slate-400">{t.name}</span>
                                            <span className="font-mono font-normal text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded">{t.number}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </motion.div>

                    {/* ── What's Next ── */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.52 }}
                        className="mb-4 text-left"
                    >
                        <p className="text-[10px] lg:text-xs font-normal text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">{t('success.whatsNext')}</p>
                        <div className="space-y-2">
                            <div className="flex items-start gap-2.5">
                                <div className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0 mt-0.5">
                                    <Mail className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                                </div>
                                <p className="text-[10px] lg:text-[11px] text-slate-600 dark:text-slate-400">
                                    {t('success.emailInfo')}
                                </p>
                            </div>
                            <div className="flex items-start gap-2.5">
                                <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0 mt-0.5">
                                    <Plane className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <p className="text-[10px] lg:text-[11px] text-slate-600 dark:text-slate-400">
                                    {t.rich('success.checkInInfo', { pnr: bookingResult.pnr || 'N/A' })}
                                </p>
                            </div>
                            <div className="flex items-start gap-2.5">
                                <div className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0 mt-0.5">
                                    <Info className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                </div>
                                <p className="text-[11px] lg:text-xs text-slate-600 dark:text-slate-400">
                                    {t('success.boardingPassInfo')}
                                </p>
                            </div>
                        </div>
                    </motion.div>

                    {/* ── Bundle Hotel Upsell ── */}
                    {(() => {
                        // For round-trips, last.arrival is back at the origin (home airport).
                        // The hotel should be at the destination — the end of the outbound leg (segmentIndex 0).
                        const isRoundTrip = (offer as any).tripType === 'round-trip';
                        const outboundSegments = isRoundTrip
                            ? offer.segments.filter((s: any) => (s.segmentIndex ?? 0) === 0)
                            : offer.segments;
                        const destinationSegment = outboundSegments[outboundSegments.length - 1] ?? last;
                        const airportCode = destinationSegment.arrival.airport;
                        const info = getAirportInfo(airportCode);
                        const cityName = info.city;
                        const countryCode = info.cc;
                        const depDate = primary.departure.time?.slice(0, 10) ?? '';
                        const checkOut = (() => {
                            if (!depDate) return '';
                            const d = new Date(depDate);
                            d.setDate(d.getDate() + 3);
                            return d.toISOString().slice(0, 10);
                        })();
                        // Pass bundleFlightId so the hotel checkout applies the 12% bundle rate
                        const bundleParam = bookingResult.bookingId ? `&bundleFlightId=${bookingResult.bookingId}` : '';
                        const hotelUrl = `/search?destination=${encodeURIComponent(cityName)}&checkIn=${depDate}&checkOut=${checkOut}&adults=1${countryCode ? `&countryCode=${countryCode}` : ''}${bundleParam}`;
                        const dest = cityName;
                        return (depDate && !isBundledWithHotel) ? (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.55, type: 'spring', bounce: 0.3 }}
                                className="mb-4"
                            >
                                <div className="relative rounded-md overflow-hidden border-2 border-violet-400 dark:border-violet-500 shadow-lg shadow-violet-500/20">
                                    {/* Gradient background */}
                                    <div className="absolute inset-0 bg-linear-to-br from-violet-600 via-indigo-600 to-blue-600 opacity-95" />

                                    {/* Decorative circles */}
                                    <div className="absolute -top-6 -right-6 w-24 h-24 bg-white/10 rounded-full" />
                                    <div className="absolute -bottom-4 -left-4 w-16 h-16 bg-white/10 rounded-full" />

                                    {/* Bundle badge */}
                                    <div className="absolute top-3 right-3 z-20">
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400 text-amber-900 text-[10px] font-normal shadow-md">
                                            {t('success.bundleDealBadge')}
                                        </span>
                                    </div>

                                    <div className="relative z-10 p-4">
                                        <div className="flex items-start gap-3 mb-3">
                                            <div className="w-11 h-11 rounded-md bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                                                <BedDouble className="w-6 h-6 text-white" />
                                            </div>
                                            <div className="flex-1 pr-16">
                                                <p className="text-sm font-normal text-white leading-tight">
                                                    {t('success.addHotel')}
                                                </p>
                                                <p className="text-xs text-violet-100 mt-0.5">
                                                    {t('success.addHotelDesc', { destination: dest })}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 mb-3 px-1">
                                            <div className="flex-1 bg-white/10 rounded-md p-2 text-center">
                                                <p className="text-[9px] text-violet-200 font-normal">{t('success.bookSeparately')}</p>
                                                <p className="text-sm font-normal text-white/60 line-through">{t('success.standardRate')}</p>
                                            </div>
                                            <div className="text-white/50 text-lg">→</div>
                                            <div className="flex-1 bg-amber-400/20 border border-amber-400/40 rounded-md p-2 text-center">
                                                <p className="text-[9px] text-amber-200 font-normal">{t('success.addToThisTrip')}</p>
                                                <p className="text-sm font-normal text-amber-300">{t('success.bundleSavings')}</p>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => router.push(hotelUrl)}
                                            className="w-full py-2.5 rounded-md bg-white text-violet-700 font-normal text-sm flex items-center justify-center gap-2 hover:bg-violet-50 active:scale-[0.98] transition-all shadow-md"
                                        >
                                            <BedDouble className="w-4 h-4" />
                                            {t('success.findHotels', { destination: dest })}
                                            <ArrowRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        ) : null;
                    })()}

                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6 }}
                        className="space-y-3"
                    >
                        <button
                            onClick={() => router.push('/trips')}
                            className="w-full py-3 lg:py-4 bg-linear-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-bold text-xs lg:text-base rounded-xl shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 transition-all active:scale-[0.98]"
                        >
                            {t('success.viewMyTrips')}
                        </button>
                        <button
                            onClick={() => router.push('/')}
                            className="w-full py-2.5 lg:py-3 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-normal text-xs transition-colors"
                        >
                            {t('success.returnToHome')}
                        </button>
                    </motion.div>
                </motion.div>
            </main>
        );
    }

    // ─── Booking Form ────────────────────────────────────────────────

    return (
        <div className="min-h-screen pt-3 lg:pt-6 pb-20 px-3 lg:px-6">
            <div className="max-w-3xl mx-auto">
                {/* Header */}
                <div className="mb-3 lg:mb-6">
                    <BackButton
                        bareIcon
                        className="mb-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur border border-slate-200/50 dark:border-slate-700/50 text-slate-700 dark:text-slate-300 w-8 h-8 lg:w-10 lg:h-10 rounded-full flex items-center justify-center shadow-sm p-0"
                    />
                    <h1 className="text-sm lg:text-xl font-normal text-slate-900 dark:text-white">
                        {(() => {
                            const airport = getAirportByCode(primary.arrival.airport);
                            const airportName = airport ? airport.name : primary.arrival.airport;
                            return (offer as any).tripType === 'round-trip'
                                ? t('header.roundTrip', { name: airportName, code: primary.arrival.airport })
                                : t('header.oneWay', { name: airportName, code: primary.arrival.airport });
                        })()}
                    </h1>
                </div>

                {/* Flight Summary */}
                <div className="bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-700 p-3 lg:p-5 mb-3 lg:mb-6 shadow-sm">
                    <div className="flex items-center gap-2 lg:gap-3 mb-2 lg:mb-3">
                        <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-md lg:rounded-md bg-white border border-slate-200 dark:border-slate-700 overflow-hidden flex items-center justify-center shadow-sm">
                            <img
                                src={`https://www.gstatic.com/flights/airline_logos/70px/${primary.airline.code}.png`}
                                alt={primary.airline.name}
                                className="w-full h-full object-contain p-1.5"
                            />
                        </div>
                        <div>
                            <div className="font-normal text-slate-900 dark:text-white text-[10px] lg:text-[13px]">{primary.airline.name}</div>
                            <div className="text-[9px] lg:text-[11px] text-slate-500 dark:text-slate-400">{primary.flightNumber}</div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 lg:gap-4">
                        <div className="text-center">
                            <div className="text-[11px] lg:text-base font-normal text-slate-900 dark:text-white">{formatTime(primary.departure.time)}</div>
                            <div className="text-[9px] lg:text-[11px] text-slate-500 dark:text-slate-400">{primary.departure.airport}</div>
                        </div>
                        <div className="flex-1 flex flex-col items-center gap-0.5">
                            <span className="text-[9px] lg:text-[11px] text-slate-400">{formatDuration(offer.totalDuration)}</span>
                            <div className="w-full h-px bg-slate-200 dark:bg-slate-700 relative">
                                <Plane className="w-3 h-3 text-indigo-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-90" />
                            </div>
                            <span className="text-[9px] lg:text-[11px] text-emerald-600 dark:text-emerald-400 font-normal">
                                {offer.totalStops === 0 ? t('orderSummary.nonstop') : t('orderSummary.stops', { count: offer.totalStops })}
                            </span>
                        </div>
                        <div className="text-center">
                            <div className="text-[11px] lg:text-base font-normal text-slate-900 dark:text-white">{formatTime(last.arrival.time)}</div>
                            <div className="text-[9px] lg:text-[11px] text-slate-500 dark:text-slate-400">{last.arrival.airport}</div>
                        </div>
                        <div className="ml-auto text-right pl-2 lg:pl-4 border-l border-slate-200 dark:border-slate-700">
                            <div className="text-sm lg:text-lg font-normal text-slate-900 dark:text-white">{formatPrice(offer.price.total + selectedSeats.reduce((s, x) => s + x.price, 0) + selectedBags.reduce((s, b) => s + b.price, 0), offer.price.currency, targetCurrency)}</div>
                            <div className="text-[9px] lg:text-[11px] text-slate-500 dark:text-slate-400">{t('totalPrice')}</div>
                        </div>
                    </div>
                    {offer.seatsRemaining != null && offer.seatsRemaining > 0 && (
                        <div className="mt-2 lg:mt-3 pt-2 lg:pt-3 border-t border-slate-100 dark:border-slate-800">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 lg:py-1 rounded-full text-[9px] lg:text-[11px] font-normal border ${offer.seatsRemaining <= 3
                                ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
                                : offer.seatsRemaining <= 6
                                    ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
                                    : 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                                }`}>
                                <Users className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
                                {offer.seatsRemaining <= 3
                                    ? offer.seatsRemaining === 1
                                        ? t('seatsRemaining.onlyLeft', { count: offer.seatsRemaining })
                                        : t('seatsRemaining.onlyLeftPlural', { count: offer.seatsRemaining })
                                    : offer.seatsRemaining <= 6
                                        ? t('seatsRemaining.leftPlural', { count: offer.seatsRemaining })
                                        : t('seatsRemaining.available', { count: offer.seatsRemaining })}
                            </span>
                        </div>
                    )}
                </div>
                {/* Deal context banner — shown when booking came from a deal card */}
                {searchParams.get('dealDiscount') || searchParams.get('dealPrice') ? (() => {
                    const dealDiscount = searchParams.get('dealDiscount');
                    const dealPrice = searchParams.get('dealPrice');
                    const dealOriginalPrice = searchParams.get('dealOriginalPrice');
                    const dealCurrency = searchParams.get('dealCurrency') || 'USD';
                    const dep = searchParams.get('departure');
                    const ret = searchParams.get('return');
                    const fmt = (iso: string) =>
                        new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    const fmtPrice = (n: number) =>
                        new Intl.NumberFormat('en-US', { style: 'currency', currency: dealCurrency, maximumFractionDigits: 0 }).format(n);
                    return (
                        <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-md bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 mb-3 lg:mb-6">
                            <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                            <div className="flex flex-col gap-0.5">
                                {dealDiscount && (
                                    <span className="text-[10px] lg:text-[11px] font-normal text-emerald-700 dark:text-emerald-400">
                                        {t('dealBanner.dealApplied', { discount: dealDiscount })}
                                    </span>
                                )}
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                    {dealPrice && (
                                        <span className="text-[10px] lg:text-[11px] text-slate-700 dark:text-slate-300">
                                            {fmtPrice(Number(dealPrice))} {t('dealBanner.perPerson')}
                                            {dealOriginalPrice && Number(dealOriginalPrice) > Number(dealPrice) && (
                                                <span className="ml-1.5 line-through text-slate-400">{fmtPrice(Number(dealOriginalPrice))}</span>
                                            )}
                                        </span>
                                    )}
                                    {dep && (
                                        <span className="text-[10px] lg:text-[11px] text-slate-500 dark:text-slate-400">
                                            · {t('dealBanner.departs', { date: fmt(dep) })}{ret ? ` · ${t('dealBanner.returns', { date: fmt(ret) })}` : ''}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })() : null}

                {/* Price Calendar — moved from search page to booking page */}
                {calendarProps && (
                    <div className="mb-3 lg:mb-6">
                        <Suspense fallback={<div className="h-10 w-full animate-pulse bg-slate-100 dark:bg-slate-800 rounded-md" />}>
                            <PriceCalendar
                                {...calendarProps}
                            />
                        </Suspense>
                    </div>
                )}

                {/* Offer expiry countdown — only for Duffel */}
                {offerExpiresAt && offer.provider === 'duffel' && (
                    <OfferExpiryBanner expiresAt={offerExpiresAt} />
                )}

                {/* Fare Policy Panel — shown from search-stage policy, updated after revalidation */}
                {offer.farePolicy && (
                    <FarePolicyPanel
                        policy={offer.farePolicy}
                        policyChanged={(offer as any).policyChanged === true}
                    />
                )}

                {/* Fare Conditions — Duffel only; read from offer.conditions (no extra API call) */}
                {offer.provider === 'duffel' && (
                    <DuffelFareConditions rawOffer={(offer as any)._raw} currency={offer.price.currency} />
                )}

                {/* Fare Rules — Mystifly only; fetched from airline via FareSourceCode */}
                {offer.provider === 'mystifly_v2' && (
                    <FareRulesPanel
                        fareSourceCode={offer.offerId.split('|')[0]}
                    />
                )}

                {/* Booking Flow: Passenger Form OR Payment Element */}
                {step === 'payment' && clientSecret ? (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <StripeEmbeddedCheckout
                            clientSecret={clientSecret}
                            onSuccess={pollForBooking}
                        />
                        <button
                            onClick={() => setStep('form')}
                            className="w-full mt-4 py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 font-normal rounded-md text-sm transition-colors"
                        >
                            {t('backToDetails')}
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-3 lg:space-y-6">
                        {/* Passengers */}
                        {passengers.map((pax, idx) => (
                            <div key={idx} className="bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-700 p-3 lg:p-5">
                                <div className="flex items-center justify-between mb-3 lg:mb-4">
                                    <h2 className="flex items-center gap-1.5 lg:gap-2 text-[11px] lg:text-[14px] font-normal text-slate-900 dark:text-white">
                                        <User className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-indigo-500" />
                                        {t('passenger.title', { number: idx + 1 })}
                                    </h2>
                                    <div className="flex items-center gap-1.5 lg:gap-2">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <button
                                                    type="button"
                                                    className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] lg:text-xs font-normal bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 transition-colors group"
                                                >
                                                    <span>{t(`passenger.${PASSENGER_TYPES.find(t => t.code === pax.type)?.label?.toLowerCase() || 'adult'}`)}</span>
                                                    <ChevronDown size={12} className="text-slate-400 transition-transform group-data-[state=open]:rotate-180" />
                                                </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="rounded-xl min-w-25 z-1001">
                                                {PASSENGER_TYPES.map((pt) => (
                                                    <DropdownMenuItem
                                                        key={pt.code}
                                                        onClick={() => updatePassenger(idx, 'type', pt.code)}
                                                        className={cn(
                                                            "flex items-center gap-2 px-3 py-1.5 text-[10px] lg:text-[11px] font-normal transition-colors cursor-pointer",
                                                            pax.type === pt.code
                                                                ? "bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400"
                                                                : "text-slate-700 dark:text-slate-300"
                                                        )}
                                                    >
                                                        <span>{t(`passenger.${pt.label?.toLowerCase() || 'adult'}`)}</span>
                                                    </DropdownMenuItem>
                                                ))}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                        {passengers.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removePassenger(idx)}
                                                className="text-[10px] lg:text-xs text-red-500 hover:text-red-400 font-normal"
                                            >
                                                {t('passenger.remove')}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 lg:gap-3">
                                    <div>
                                        <FieldError message={fieldErrors[`passengers.${idx}.firstName`]} />
                                        <input
                                            type="text" placeholder={t('passenger.firstName')} required
                                            data-field={`passengers.${idx}.firstName`}
                                            aria-invalid={!!fieldErrors[`passengers.${idx}.firstName`]}
                                            value={pax.firstName}
                                            onChange={(e) => updatePassenger(idx, 'firstName', e.target.value)}
                                            onBlur={(e) => validateField(`passengers.${idx}.firstName`, e.target.value)}
                                            className={fieldClass(!!fieldErrors[`passengers.${idx}.firstName`])}
                                        />
                                    </div>
                                    <div>
                                        <FieldError message={fieldErrors[`passengers.${idx}.lastName`]} />
                                        <input
                                            type="text" placeholder={t('passenger.lastName')} required
                                            data-field={`passengers.${idx}.lastName`}
                                            aria-invalid={!!fieldErrors[`passengers.${idx}.lastName`]}
                                            value={pax.lastName}
                                            onChange={(e) => updatePassenger(idx, 'lastName', e.target.value)}
                                            onBlur={(e) => validateField(`passengers.${idx}.lastName`, e.target.value)}
                                            className={fieldClass(!!fieldErrors[`passengers.${idx}.lastName`])}
                                        />
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button
                                                type="button"
                                                className="w-full flex items-center justify-between px-2.5 lg:px-3 py-2 lg:py-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-[10px] lg:text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 group"
                                            >
                                                <span className={cn(!pax.gender && "text-slate-400")}>
                                                    {GENDERS.find(g => g.value === pax.gender) ? t(`genderOptions.${pax.gender === 'M' ? 'male' : 'female'}`) : t('passenger.gender')}
                                                </span>
                                                <ChevronDown size={14} className="text-slate-400 transition-transform group-data-[state=open]:rotate-180" />
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="start" className="rounded-xl min-w-35 z-1001">
                                            {GENDERS.map((g) => (
                                                <DropdownMenuItem
                                                    key={g.value}
                                                    onClick={() => updatePassenger(idx, 'gender', g.value)}
                                                    className={cn(
                                                        "flex items-center gap-2 px-3 py-2 text-[10px] lg:text-[12px] font-normal transition-colors cursor-pointer",
                                                        pax.gender === g.value
                                                            ? "bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400"
                                                            : "text-slate-700 dark:text-slate-300"
                                                    )}
                                                >
                                                    <span>{t(`genderOptions.${g.value === 'M' ? 'male' : 'female'}`)}</span>
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                    <div data-field={`passengers.${idx}.birthDate`}>
                                        <FieldError message={fieldErrors[`passengers.${idx}.birthDate`]} />
                                        <FormDatePicker
                                            placeholder={t('passenger.birthdate')}
                                            value={pax.birthDate}
                                            onChange={(val) => { updatePassenger(idx, 'birthDate', val); validateField(`passengers.${idx}.birthDate`, val); }}
                                            maxDate={new Date()}
                                            defaultViewDate={defaultBirthdateView()}
                                            required
                                        />
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button
                                                type="button"
                                                className="w-full flex items-center justify-between px-2.5 lg:px-3 py-2 lg:py-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-[10px] lg:text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 group"
                                            >
                                                <span>
                                                    {NATIONALITIES.find(n => n.code === pax.nationality) ? t(`countries.${pax.nationality}`) : t('passenger.nationality')}
                                                </span>
                                                <ChevronDown size={14} className="text-slate-400 transition-transform group-data-[state=open]:rotate-180" />
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="start" className="rounded-xl min-w-50 max-h-75 overflow-y-auto z-1001">
                                            {NATIONALITIES.map((n) => (
                                                <DropdownMenuItem
                                                    key={n.code}
                                                    onClick={() => updatePassenger(idx, 'nationality', n.code)}
                                                    className={cn(
                                                        "flex items-center gap-2 px-3 py-2 text-[10px] lg:text-[12px] font-normal transition-colors cursor-pointer",
                                                        pax.nationality === n.code
                                                            ? "bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400"
                                                            : "text-slate-700 dark:text-slate-300"
                                                    )}
                                                >
                                                    <span className="text-[9px] text-slate-400 font-bold w-6">{n.code}</span>
                                                    <span>{t(`countries.${n.code}`)}</span>
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                    <div>
                                        <FieldError message={fieldErrors[`passengers.${idx}.passport`]} />
                                        <input
                                            type="text" placeholder={t('passenger.passport')} required
                                            data-field={`passengers.${idx}.passport`}
                                            aria-invalid={!!fieldErrors[`passengers.${idx}.passport`]}
                                            value={pax.passport}
                                            onChange={(e) => updatePassenger(idx, 'passport', e.target.value)}
                                            onBlur={(e) => validateField(`passengers.${idx}.passport`, e.target.value)}
                                            className={fieldClass(!!fieldErrors[`passengers.${idx}.passport`])}
                                        />
                                    </div>
                                    <div className="lg:col-span-2" data-field={`passengers.${idx}.passportExpiry`}>
                                        <FieldError message={fieldErrors[`passengers.${idx}.passportExpiry`]} />
                                        <FormDatePicker
                                            value={pax.passportExpiry}
                                            onChange={(val) => { updatePassenger(idx, 'passportExpiry', val); validateField(`passengers.${idx}.passportExpiry`, val); }}
                                            minDate={new Date()}
                                            required
                                            placeholder={t('passenger.passportExpiry')}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}

                        {/* Add Passenger Button */}
                        <button
                            type="button"
                            onClick={addPassenger}
                            className="w-full py-2 lg:py-2.5 rounded-md border-2 border-dashed border-slate-300 dark:border-slate-700 text-[10px] lg:text-[13px] text-slate-500 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors"
                        >
                            {t('passenger.addPassenger')}
                        </button>

                        {/* Contact Info */}
                        <div className="bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-700 p-3 lg:p-5">
                            <h2 className="flex items-center gap-1.5 lg:gap-2 text-[11px] lg:text-[14px] font-normal text-slate-900 dark:text-white mb-3 lg:mb-4">
                                <Mail className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-indigo-500" />
                                {t('contact.title')}
                            </h2>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 lg:gap-3">
                                <div>
                                <FieldError message={fieldErrors['contact.email']} />
                                <input
                                    type="email" placeholder={t('contact.email')} required
                                    data-field="contact.email"
                                    aria-invalid={!!fieldErrors['contact.email']}
                                    value={contact.email}
                                    onChange={(e) => { setContact(prev => ({ ...prev, email: e.target.value })); clearFieldError('contact.email'); }}
                                    onBlur={(e) => validateField('contact.email', e.target.value)}
                                    className={fieldClass(!!fieldErrors['contact.email'])}
                                />
                                </div>
                                <div>
                                <FieldError message={fieldErrors['contact.phone']} />
                                <div className="flex gap-1.5 lg:gap-2">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button
                                                type="button"
                                                className="w-22.5 lg:w-26.25 flex items-center justify-between px-1.5 lg:px-2 py-2 lg:py-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-[10px] lg:text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 group"
                                            >
                                                <span>+{contact.countryCode}</span>
                                                <ChevronDown size={12} className="text-slate-400 transition-transform group-data-[state=open]:rotate-180" />
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="start" className="rounded-xl min-w-30 max-h-75 overflow-y-auto z-1001">
                                            {PHONE_CODES.map((p) => (
                                                <DropdownMenuItem
                                                    key={p.code}
                                                    onClick={() => setContact(prev => ({ ...prev, countryCode: p.code }))}
                                                    className={cn(
                                                        "flex items-center gap-2 px-3 py-2 text-[10px] lg:text-[12px] font-normal transition-colors cursor-pointer",
                                                        contact.countryCode === p.code
                                                            ? "bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400"
                                                            : "text-slate-700 dark:text-slate-300"
                                                    )}
                                                >
                                                    <span>{p.label}</span>
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                    <input
                                        type="tel" placeholder={t('contact.phone')} required
                                        data-field="contact.phone"
                                        aria-invalid={!!fieldErrors['contact.phone']}
                                        value={contact.phone}
                                        onChange={(e) => { setContact(prev => ({ ...prev, phone: e.target.value })); clearFieldError('contact.phone'); }}
                                        onBlur={(e) => validateField('contact.phone', e.target.value)}
                                        className={fieldClass(!!fieldErrors['contact.phone'], 'flex-1')}
                                    />
                                </div>
                                </div>
                            </div>
                        </div>

                        {/* Address */}
                        <div className="bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-700 p-3 lg:p-5">
                            <h2 className="flex items-center gap-1.5 lg:gap-2 text-[11px] lg:text-[14px] font-normal text-slate-900 dark:text-white mb-3 lg:mb-4">
                                <MapPin className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-indigo-500" />
                                {t('address.title')}
                            </h2>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 lg:gap-3">
                                <input
                                    type="text" placeholder={t('address.addressLine')} required
                                    value={contact.addressLine}
                                    onChange={(e) => setContact(prev => ({ ...prev, addressLine: e.target.value }))}
                                    className="w-full px-2.5 lg:px-3 py-2 lg:py-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-[10px] lg:text-[13px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 lg:col-span-2"
                                />
                                <input
                                    type="text" placeholder={t('address.city')} required
                                    value={contact.city}
                                    onChange={(e) => setContact(prev => ({ ...prev, city: e.target.value }))}
                                    className="w-full px-2.5 lg:px-3 py-2 lg:py-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-[10px] lg:text-[13px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                                />
                                <input
                                    type="text" placeholder={t('address.postalCode')} required
                                    value={contact.postalCode}
                                    onChange={(e) => setContact(prev => ({ ...prev, postalCode: e.target.value }))}
                                    className="w-full px-2.5 lg:px-3 py-2 lg:py-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-[10px] lg:text-[13px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                                />
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button
                                            type="button"
                                            className="w-full flex items-center justify-between px-2.5 lg:px-3 py-2 lg:py-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-[10px] lg:text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 lg:col-span-2 group"
                                        >
                                            <span>
                                                {NATIONALITIES.find(n => n.code === contact.country) ? t(`countries.${contact.country}`) : t('address.country')}
                                            </span>
                                            <ChevronDown size={14} className="text-slate-400 transition-transform group-data-[state=open]:rotate-180" />
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start" className="rounded-xl min-w-50 max-h-75 overflow-y-auto z-1001">
                                        {NATIONALITIES.map((n) => (
                                            <DropdownMenuItem
                                                key={n.code}
                                                onClick={() => setContact(prev => ({ ...prev, country: n.code }))}
                                                className={cn(
                                                    "flex items-center gap-2 px-3 py-2 text-[10px] lg:text-[12px] font-normal transition-colors cursor-pointer",
                                                    contact.country === n.code
                                                        ? "bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400"
                                                        : "text-slate-700 dark:text-slate-300"
                                                )}
                                            >
                                                <span className="text-[9px] text-slate-400 font-bold w-6">{n.code}</span>
                                                <span>{t(`countries.${n.code}`)}</span>
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>

                        {/* ── Duffel extras: bags + seats (optional, inline) ──── */}
                        {offer.provider === 'duffel' && (
                            <div className="space-y-2">
                                {/* Bags */}
                                <div className="bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => setBagsOpen(o => !o)}
                                        className="w-full flex items-center gap-3 px-3 lg:px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                                    >
                                        <div className="w-8 h-8 rounded-md bg-sky-50 dark:bg-sky-900/30 flex items-center justify-center shrink-0">
                                            <Luggage className="w-4 h-4 text-sky-500" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[11px] lg:text-[13px] font-normal text-slate-800 dark:text-slate-200">{t('bags.title')}</p>
                                            <p className="text-[9px] lg:text-[11px] text-slate-400 dark:text-slate-500">
                                                {selectedBags.length > 0
                                                    ? (selectedBags.length === 1
                                                        ? t('bags.added', { count: selectedBags.length, price: formatPrice(selectedBags.reduce((s, b) => s + b.price, 0), offer.price.currency, targetCurrency) })
                                                        : t('bags.addedPlural', { count: selectedBags.length, price: formatPrice(selectedBags.reduce((s, b) => s + b.price, 0), offer.price.currency, targetCurrency) }))
                                                    : t('bags.optional')}
                                            </p>
                                        </div>
                                        <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
                                            {bagsOpen ? '▲' : '▼'}
                                        </span>
                                    </button>
                                    {/* Always mounted so the fetch fires at page load, not on first open */}
                                    <div className={!bagsOpen ? 'hidden' : 'px-3 lg:px-4 pb-3 pt-1 border-t border-slate-100 dark:border-slate-800'}>
                                        {refreshingOffer ? (
                                            <div className="flex items-center gap-2 py-6 text-sm text-slate-500 justify-center">
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                {t('bags.refreshing')}
                                            </div>
                                        ) : refreshFailed ? (
                                            <AncillaryExpiredNotice />
                                        ) : (
                                            <BagSelectionPanel
                                                key={effectiveOfferId}
                                                offerId={effectiveOfferId}
                                                duffelPassengerIds={((offer as any)._rawOffer?.passengers ?? (offer as any).raw?.passengers ?? []).map((p: any) => p.id)}
                                                passengerCount={passengers.length}
                                                passengerLabels={passengers.map((p, i) => `${t('passenger.title', { number: i + 1 })}${p.firstName ? ` (${p.firstName})` : ''}`)}
                                                selectedBags={selectedBags}
                                                onBagsChange={setSelectedBags}
                                                currency={offer.price.currency}
                                                onOfferExpired={refreshOffer}
                                            />
                                        )}
                                    </div>
                                </div>

                                {/* Seats */}
                                <div className="bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => setSeatsOpen(o => !o)}
                                        className="w-full flex items-center gap-3 px-3 lg:px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                                    >
                                        <div className="w-8 h-8 rounded-md bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                                            <Armchair className="w-4 h-4 text-indigo-500" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[11px] lg:text-[13px] font-normal text-slate-800 dark:text-slate-200">{t('seats.title')}</p>
                                            <p className="text-[9px] lg:text-[11px] text-slate-400 dark:text-slate-500">
                                                {selectedSeats.length > 0
                                                    ? (selectedSeats.length === 1
                                                        ? t('seats.selected', { count: selectedSeats.length, price: formatPrice(selectedSeats.reduce((s, x) => s + x.price, 0), offer.price.currency, targetCurrency) })
                                                        : t('seats.selectedPlural', { count: selectedSeats.length, price: formatPrice(selectedSeats.reduce((s, x) => s + x.price, 0), offer.price.currency, targetCurrency) }))
                                                    : t('seats.optional')}
                                            </p>
                                        </div>
                                        <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
                                            {seatsOpen ? '▲' : '▼'}
                                        </span>
                                    </button>
                                    {/* Always mounted so the fetch fires at page load, not on first open */}
                                    <div className={!seatsOpen ? 'hidden' : 'px-3 lg:px-4 pb-3 pt-1 border-t border-slate-100 dark:border-slate-800'}>
                                        {refreshingOffer ? (
                                            <div className="flex items-center gap-2 py-6 text-sm text-slate-500 justify-center">
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                {t('bags.refreshing')}
                                            </div>
                                        ) : refreshFailed ? (
                                            <AncillaryExpiredNotice />
                                        ) : (
                                            <SeatMapPanel
                                                key={effectiveOfferId}
                                                offerId={effectiveOfferId}
                                                segments={offer.segments.map(s => ({ origin: s.departure.airport, destination: s.arrival.airport }))}
                                                passengerCount={passengers.length}
                                                passengerLabels={passengers.map((p, i) => `${t('passenger.title', { number: i + 1 })}${p.firstName ? ` (${p.firstName})` : ''}`)}
                                                selectedSeats={selectedSeats}
                                                onSeatsChange={setSelectedSeats}
                                                currency={offer.price.currency}
                                                onDone={() => setSeatsOpen(false)}
                                                onOfferExpired={refreshOffer}
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Price-change confirmation banner */}
                        {priceChangedData && (
                            <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 lg:p-4 space-y-2.5">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-[10px] lg:text-[13px] font-normal text-amber-800 dark:text-amber-300">{t('priceChange.title')}</p>
                                        <p className="text-[10px] lg:text-[13px] text-amber-700 dark:text-amber-400 mt-0.5">
                                            {t('priceChange.description', {
                                                newPrice: new Intl.NumberFormat('en-US', { style: 'currency', currency: priceChangedData.currency }).format(priceChangedData.newPrice),
                                                oldPrice: new Intl.NumberFormat('en-US', { style: 'currency', currency: priceChangedData.currency }).format(priceChangedData.oldPrice),
                                            })}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={confirmPriceChange}
                                        className="flex-1 py-2 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-normal text-[10px] lg:text-[13px] transition-colors"
                                    >
                                        {t('priceChange.accept')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => router.back()}
                                        className="flex-1 py-2 rounded-md bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 font-normal text-[10px] lg:text-[13px] transition-colors hover:bg-amber-50 dark:hover:bg-amber-900/30"
                                    >
                                        {t('priceChange.searchAgain')}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Duplicate booking — presented as a modal decision point rather
                            than an inline banner: the server has already refused this
                            booking, so the form behind it cannot proceed either way. */}
                        <DuplicateBookingModal
                            data={duplicateBookingData}
                            onKeep={dismissDuplicateWarning}
                            onView={(id) => router.push(`/trips?highlight=${id}`)}
                        />

                        {/* Status/Error Message */}
                        {errorMsg && (() => {
                            const isPending = errorMsg?.toLowerCase().includes('pending');
                            // Same `CODE:` convention as the failure screen — resolve it to
                            // copy here too, or the banner shows the raw code.
                            const bannerMsg = errorMsg.startsWith('CODE:')
                                ? messageForCode(t, errorMsg.slice(5), 'error.bookingFailedDefault')
                                : errorMsg;
                            return (
                                <div className={`flex items-center gap-1.5 lg:gap-2 p-2.5 lg:p-4 rounded-md lg:rounded-md border ${isPending
                                    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
                                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
                                    } text-[10px] lg:text-[13px] relative`}>
                                    {isPending ? (
                                        <Info className="w-3.5 h-3.5 lg:w-4 lg:h-4 shrink-0" />
                                    ) : (
                                        <AlertTriangle className="w-3.5 h-3.5 lg:w-4 lg:h-4 shrink-0" />
                                    )}
                                    <span className="pr-6">
                                        {bannerMsg || t('error.bookingFailedDefault')}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setErrorMsg('');
                                        }}
                                        className="absolute right-2 lg:right-3 p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors"
                                    >
                                        <X className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                                    </button>
                                </div>
                            );
                        })()}

                        {/* Booking summary */}
                        <div className="bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-700 p-3 lg:p-5 shadow-sm">
                            <h3 className="text-[10px] lg:text-xs font-normal text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">{t('orderSummary.title')}</h3>

                            {/* Flight itinerary */}
                            <div className="flex items-center gap-2 lg:gap-4 mb-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                                <div className="text-center">
                                    <div className="text-[11px] lg:text-sm font-normal text-slate-900 dark:text-white">{formatTime(primary.departure.time)}</div>
                                    <div className="text-[9px] lg:text-[11px] text-slate-500">{primary.departure.airport}</div>
                                    <div className="text-[9px] text-slate-400">{primary.departure.time?.slice(0, 10)}</div>
                                </div>
                                <div className="flex-1 flex flex-col items-center gap-0.5">
                                    <span className="text-[9px] lg:text-[11px] text-slate-400">{formatDuration(offer.totalDuration)}</span>
                                    <div className="w-full h-px bg-slate-200 dark:bg-slate-700 relative">
                                        <Plane className="w-3 h-3 text-indigo-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-90" />
                                    </div>
                                    <span className="text-[9px] lg:text-[11px] text-slate-400">
                                        {offer.totalStops === 0 ? t('orderSummary.nonstop') : t('orderSummary.stops', { count: offer.totalStops })}
                                    </span>
                                </div>
                                <div className="text-center">
                                    <div className="text-[11px] lg:text-sm font-normal text-slate-900 dark:text-white">{formatTime(last.arrival.time)}</div>
                                    <div className="text-[9px] lg:text-[11px] text-slate-500">{last.arrival.airport}</div>
                                    <div className="text-[9px] text-slate-400">{last.arrival.time?.slice(0, 10)}</div>
                                </div>
                            </div>

                            {/* Meta row */}
                            <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                                <span className="text-[9px] lg:text-[11px] text-slate-500 dark:text-slate-400">{primary.airline.name} · {primary.flightNumber}</span>
                                <span className="text-[9px] lg:text-[11px] text-slate-500 dark:text-slate-400">{primary.cabinClass?.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) || t('orderSummary.economy')}</span>
                                <span className="text-[9px] lg:text-[11px] text-slate-500 dark:text-slate-400">{passengers.length === 1 ? t('orderSummary.passenger', { count: 1 }) : t('orderSummary.passengerPlural', { count: passengers.length })}</span>
                            </div>

                            {/* Price breakdown */}
                            <div className="space-y-1.5">
                                <div className="flex justify-between">
                                    <span className="text-[10px] lg:text-[11px] text-slate-500 dark:text-slate-400">{t('orderSummary.baseFare')}</span>
                                    <span className="text-[10px] lg:text-[11px] text-slate-900 dark:text-white">{formatPrice(offer.price.total, offer.price.currency, targetCurrency)}</span>
                                </div>
                                {selectedSeats.length > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-[10px] lg:text-[11px] text-slate-500 dark:text-slate-400">{t('orderSummary.seatSelection')}</span>
                                        <span className="text-[10px] lg:text-[11px] text-slate-900 dark:text-white">+{formatPrice(selectedSeats.reduce((s, x) => s + x.price, 0), offer.price.currency, targetCurrency)}</span>
                                    </div>
                                )}
                                {selectedBags.length > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-[10px] lg:text-[11px] text-slate-500 dark:text-slate-400">{t('orderSummary.extraBags')}</span>
                                        <span className="text-[10px] lg:text-[11px] text-slate-900 dark:text-white">+{formatPrice(selectedBags.reduce((s, b) => s + b.price, 0), offer.price.currency, targetCurrency)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                                    <span className="text-[11px] lg:text-[13px] font-normal text-slate-900 dark:text-white">{t('orderSummary.total')}</span>
                                    <span className="text-[11px] lg:text-[13px] font-normal text-slate-900 dark:text-white">
                                        {formatPrice(
                                            offer.price.total + selectedSeats.reduce((s, x) => s + x.price, 0) + selectedBags.reduce((s, b) => s + b.price, 0),
                                            offer.price.currency,
                                            targetCurrency,
                                        )}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={step === 'submitting'}
                            className="w-full py-2.5 lg:py-3 rounded-md bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-normal text-[10px] lg:text-[13px] transition-colors flex items-center justify-center gap-2"
                        >
                            {step === 'submitting' ? (
                                <>
                                    <Loader2 className="w-3.5 h-3.5 lg:w-4 lg:h-4 animate-spin" />
                                    {t('submitBtn.processing')}
                                </>
                            ) : (
                                <>
                                    {t('submitBtn.confirm', {
                                        price: formatPrice(
                                            offer.price.total
                                            + selectedSeats.reduce((s, x) => s + x.price, 0)
                                            + selectedBags.reduce((s, b) => s + b.price, 0),
                                            offer.price.currency,
                                            targetCurrency,
                                        )
                                    })}
                                </>
                            )}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}

// ─── Deal Gate ───────────────────────────────────────────────────────────────
// Shown when a deal card is clicked. Collects passenger count, fires a search,
// seeds sessionStorage, then hands off to BookingContent.

interface DealGateProps {
    origin: string;
    destination: string;
    departure: string;
    returnDate?: string;
    cabinClass: string;
    onReady: () => void;
}

const DEAL_SEARCH_MESSAGES: readonly string[] = [];

function DealGate({
    origin, destination, departure, returnDate, cabinClass,
    onReady,
}: DealGateProps) {
    const t = useTranslations('flightBook');
    const router = useRouter();
    const [hasError, setHasError] = React.useState(false);
    const [errorMsg, setErrorMsg] = React.useState('');
    const [msgIdx, setMsgIdx] = React.useState(0);
    const searchFired = React.useRef(false);

    const originInfo = getAirportByCode(origin);
    const destInfo = getAirportByCode(destination);
    const originLabel = originInfo ? `${originInfo.city} (${origin})` : origin;
    const destLabel = destInfo ? `${destInfo.city} (${destination})` : destination;
    const isRoundTrip = !!returnDate;

    const formatDealDate = (iso: string) =>
        new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    const runSearch = React.useCallback(async () => {
        setHasError(false);
        setMsgIdx(0);
        try {
            const res = await fetch('/api/flights/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    origin,
                    destination,
                    departureDate: departure,
                    returnDate: returnDate || undefined,
                    passengers: { adults: 1, children: 0, infants: 0 },
                    cabinClass,
                    tripType: isRoundTrip ? 'round-trip' : 'one-way',
                }),
            });
            const json = await res.json();
            if (!json.success || !json.data?.offers?.length) {
                setHasError(true);
                setErrorMsg(json.error || t('dealGate.noFlightsFound'));
                return;
            }
            const offers: import('@/types/flights').FlightOffer[] = json.data.offers;
            const cheapest = offers.reduce((min: any, o: any) => o.price.total < min.price.total ? o : min, offers[0]);
            sessionStorage.setItem('selectedFlight', JSON.stringify(cheapest));
            sessionStorage.setItem('flightSearchPassengers', JSON.stringify({ adults: 1, children: 0, infants: 0 }));
            onReady();
        } catch (err: any) {
            setHasError(true);
            setErrorMsg(err.message || t('dealGate.somethingWrong'));
        }
    }, [origin, destination, departure, returnDate, cabinClass, isRoundTrip, onReady]);

    React.useEffect(() => {
        if (searchFired.current) return;
        searchFired.current = true;
        runSearch();
    }, [runSearch]);

    React.useEffect(() => {
        if (hasError) return;
        const id = setInterval(() => setMsgIdx(i => Math.min(i + 1, DEAL_SEARCH_MESSAGES.length - 1)), 4000);
        return () => clearInterval(id);
    }, [hasError]);

    if (hasError) {
        return (
            <div className="min-h-screen bg-linear-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 flex items-center justify-center px-4">
                <div className="bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-700 p-6 max-w-sm w-full text-center shadow-sm space-y-4">
                    <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
                    <div>
                        <h2 className="text-sm font-normal text-slate-900 dark:text-white mb-1">{t('dealGate.dealUnavailable')}</h2>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{errorMsg}</p>
                    </div>
                    <div className="space-y-2">
                        <button
                            onClick={() => { searchFired.current = false; runSearch(); }}
                            className="w-full py-2.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-normal transition-colors">
                            {t('dealGate.tryAgain')}
                        </button>
                        <button
                            onClick={() => router.push(`/flights/search?origin=${origin}&destination=${destination}&departure=${departure}${returnDate ? `&return=${returnDate}` : ''}&cabin=${cabinClass}`)}
                            className="w-full py-2.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-[11px] font-normal hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                            {t('dealGate.searchAll')}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-linear-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 flex items-center justify-center px-4">
            <div className="flex flex-col items-center gap-6 text-center max-w-xs">
                <div className="w-16 h-16 rounded-full border-4 border-indigo-100 dark:border-indigo-900 border-t-indigo-600 animate-spin" />
                <div>
                    <h2 className="text-base font-normal text-slate-900 dark:text-white mb-1">{t('dealGate.securingDeal')}</h2>
                    <p className="text-[11px] text-indigo-600 dark:text-indigo-400 animate-pulse">
                        {t.raw('dealGate.searchMessages')[msgIdx]}
                    </p>
                </div>
                <p className="text-[10px] text-slate-400">{originLabel} → {destLabel} · {formatDealDate(departure)}</p>
            </div>
        </div>
    );
}

// ─── Wrapper ─────────────────────────────────────────────────────────────────
// Detects deal mode (origin/destination in URL, no offer in sessionStorage)
// and shows DealGate before mounting BookingContent.

export default function FlightBookContent() {
    const searchParams = useSearchParams();
    const [offerSeeded, setOfferSeeded] = React.useState(() => {
        if (typeof window === 'undefined') return false;
        return !!sessionStorage.getItem('selectedFlight');
    });

    const origin = searchParams.get('origin');
    const destination = searchParams.get('destination');
    const departure = searchParams.get('departure');

    const isDealMode = !!(origin && destination && departure && !offerSeeded);

    if (isDealMode) {
        return (
            <DealGate
                origin={origin}
                destination={destination}
                departure={departure}
                returnDate={searchParams.get('return') ?? undefined}
                cabinClass={searchParams.get('cabinClass') || 'economy'}
                onReady={() => setOfferSeeded(true)}
            />
        );
    }

    return <BookingContent />;
}
