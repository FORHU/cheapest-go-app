"use client";

import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plane, User, Mail, Loader2, CheckCircle, AlertTriangle, MapPin, PartyPopper, Info, Clock, Shield, XCircle, BadgeDollarSign, RefreshCw, Users, BedDouble, ArrowRight, Armchair, Luggage } from 'lucide-react';
import BackButton from '@/components/common/BackButton';
import StripeEmbeddedCheckout from '@/components/checkout/StripeEmbeddedCheckout';
import { Confetti, Balloons } from '@/components/ui/Animations';
import { formatTime, formatDuration, formatPrice } from '@/utils/flight-utils';
import { useFlightBooking } from '@/hooks/flights/useFlightBooking';
import { useUserCurrency } from '@/stores/searchStore';
import type { FarePolicy } from '@/types/flights';
import { getAirportInfo } from '@/utils/airport-info';
import { FareRulesPanel } from './FareRulesPanel';
import SeatMapPanel from '@/components/flights/SeatMapPanel';
import BagSelectionPanel from '@/components/flights/BagSelectionPanel';

// ─── Fare Policy Panel ───────────────────────────────────────────────

interface FarePolicyPanelProps {
    policy: FarePolicy;
    policyChanged?: boolean;
}

function FarePolicyPanel({ policy, policyChanged }: FarePolicyPanelProps) {
    const isRefundable = policy.isRefundable;
    const penalty = policy.refundPenaltyAmount;
    const isLocked = policy.policyVersion === 'revalidated';

    let badge: React.ReactNode;
    if (isRefundable && penalty === 0) {
        badge = (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                <Shield className="w-3 h-3" /> Free cancellation
            </span>
        );
    } else if (isRefundable) {
        const feeLabel = penalty != null && penalty > 0
            ? `Refundable (fee: ${policy.refundPenaltyCurrency ?? ''}${penalty})`
            : 'Refundable (fees may apply)';
        badge = (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400">
                <BadgeDollarSign className="w-3 h-3" /> {feeLabel}
            </span>
        );
    } else {
        badge = (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400">
                <XCircle className="w-3 h-3" /> Non-refundable
            </span>
        );
    }

    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-3 lg:p-5 mb-3 lg:mb-6 shadow-sm space-y-2">
            {/* Policy downgrade warning */}
            {policyChanged && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-xs">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                        <strong>Fare policy updated.</strong> The refundability of this fare has changed since you selected it. Please review before proceeding.
                    </span>
                </div>
            )}
            <div className="flex items-center justify-between">
                <h3 className="text-xs lg:text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 text-indigo-500" />
                    Fare Policy
                </h3>
                {isLocked && (
                    <span className="text-[9px] lg:text-xs text-emerald-600 dark:text-emerald-400 font-medium">✓ Airline confirmed</span>
                )}
            </div>
            <div className="flex flex-wrap gap-1.5 items-center">
                {badge}
                {policy.isChangeable && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400">
                        Changes allowed
                    </span>
                )}
            </div>
            <p className="text-[10px] lg:text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
                {isLocked
                    ? 'Final fare rules confirmed by airline during booking.'
                    : 'Indicative only — final policy confirmed at payment stage.'}
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
    const secsLeft = useCountdown(expiresAt);
    if (secsLeft === null || secsLeft > 10 * 60) return null; // Only show under 10 min
    const mins = Math.floor(secsLeft / 60);
    const secs = secsLeft % 60;
    const isUrgent = secsLeft < 2 * 60;
    return (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium mb-3 border ${
            isUrgent
                ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
                : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
        }`}>
            <Clock className="w-3.5 h-3.5 shrink-0" />
            {secsLeft === 0
                ? 'This offer has expired — please search again.'
                : `Offer expires in ${mins}:${String(secs).padStart(2, '0')} — complete your booking before time runs out.`}
        </div>
    );
}

export default function FlightBookContent() {
    const {
        offer,
        offerExpiresAt,
        step,
        errorMsg,
        bookingResult,
        passengers,
        contact,
        updatePassenger,
        addPassenger,
        removePassenger,
        setContact,
        handleSubmit,
        selectedSeats,
        setSelectedSeats,
        selectedBags,
        setSelectedBags,
        router,
        clientSecret,
        setStep,
        pollForBooking,
    } = useFlightBooking();

    const [bagsOpen, setBagsOpen] = React.useState(false);
    const [seatsOpen, setSeatsOpen] = React.useState(false);
    const targetCurrency = useUserCurrency();

    // ─── Loading ─────────────────────────────────────────────────────

    if (!offer) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 bg-grid-alabaster dark:bg-grid-obsidian flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
        );
    }

    // ─── Post-Payment PNR Loading ─────────────────────────────────────
    // Shown after Stripe payment succeeds while we poll for the PNR from the webhook.
    // We stay in 'submitting' until the PNR arrives, then flip to 'success'.
    if (step === 'submitting' && clientSecret) {
        return (
            <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50/60 via-white/40 to-indigo-50/60 dark:from-slate-950/60 dark:via-slate-900/40 dark:to-emerald-950/60">
                <div className="flex flex-col items-center gap-4 text-center">
                    <div className="w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 animate-pulse">
                        <Plane className="w-8 h-8 text-white" />
                    </div>
                    <div>
                        <p className="text-lg font-bold text-slate-900 dark:text-white">Confirming Your Booking</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Fetching your PNR reference…</p>
                    </div>
                    <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                </div>
            </main>
        );
    }

    const primary = offer.segments[0];
    const last = offer.segments[offer.segments.length - 1];

    // ─── Booking Failed State ─────────────────────────────────────────

    if (step === 'error') {
        const isPending = errorMsg?.toLowerCase().includes('pending');
        return (
            <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50/60 via-white/40 to-orange-50/60 dark:from-slate-950/60 dark:via-slate-900/40 dark:to-red-950/60 px-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.4, type: 'spring', bounce: 0.3 }}
                    className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-6 lg:p-10 rounded-2xl shadow-2xl max-w-md w-full text-center border border-white/50 dark:border-white/10"
                >
                    <div className={`w-16 h-16 mx-auto mb-5 rounded-full flex items-center justify-center shadow-lg ${isPending ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                        {isPending
                            ? <Clock className="w-8 h-8 text-amber-600 dark:text-amber-400" />
                            : <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
                        }
                    </div>
                    <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                        {isPending ? 'Flight Unavailable' : 'Booking Failed'}
                    </h1>
                    <p className={`text-sm mb-2 ${isPending ? 'text-amber-700 dark:text-amber-400' : 'text-red-700 dark:text-red-400'}`}>
                        {errorMsg || 'Your booking could not be completed.'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
                        {errorMsg?.includes('automatically refunded')
                            ? 'Please try a different flight or date.'
                            : <>Your card has <strong>not</strong> been charged. Please try a different flight or date.</>
                        }
                    </p>
                    {/* Only show Try Again if the error happened before payment was taken */}
                    {!errorMsg?.includes('automatically refunded') && !errorMsg?.includes('expired') && (
                        <button
                            onClick={() => setStep('form')}
                            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors"
                        >
                            Try Again
                        </button>
                    )}
                    <button
                        onClick={() => router.push('/flights/search')}
                        className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-medium text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                        Search Again
                    </button>
                    <button
                        onClick={() => router.back()}
                        className="w-full mt-2 py-2.5 text-slate-400 dark:text-slate-500 font-medium text-xs hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                    >
                        Go Back
                    </button>
                </motion.div>
            </main>
        );
    }

    // ─── Success State ───────────────────────────────────────────────

    if (step === 'success' && bookingResult) {

        return (
            <main className="min-h-screen pt-6 lg:pt-24 pb-20 px-3 lg:px-4 flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-emerald-50/60 via-white/40 to-indigo-50/60 dark:from-slate-950/60 dark:via-slate-900/40 dark:to-emerald-950/60">
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
                    className="relative z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-5 lg:p-8 rounded-2xl lg:rounded-3xl shadow-2xl max-w-md w-full text-center border border-white/50 dark:border-white/10"
                >
                    {/* Success Icon with Animation */}
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: 'spring', bounce: 0.6 }}
                        className="relative mx-auto mb-4 lg:mb-6 w-16 lg:w-20 flex justify-center"
                    >
                        <motion.div
                            className="w-16 h-16 lg:w-20 lg:h-20 bg-gradient-to-br from-emerald-400 to-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/30"
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
                        className="text-lg lg:text-2xl font-bold text-slate-900 dark:text-white mb-1.5 lg:mb-2"
                    >
                        Booking Confirmed! 🎉
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        className="text-xs lg:text-base text-slate-500 dark:text-slate-400 mb-4 lg:mb-6"
                    >
                        Your flight has been booked successfully.
                    </motion.p>

                    {/* Booking Details Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                        className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-white/5 dark:to-white/10 p-3.5 lg:p-5 rounded-xl lg:rounded-2xl mb-4 lg:mb-6 text-left border border-slate-200/50 dark:border-white/5 space-y-3 lg:space-y-4"
                    >
                        <div className="flex justify-between items-center pb-3 border-b border-slate-200 dark:border-white/10">
                            <span className="text-[10px] lg:text-sm text-slate-500 dark:text-slate-400">PNR</span>
                            <span className="text-[10px] lg:text-sm font-mono font-bold text-slate-900 dark:text-white">{bookingResult.pnr}</span>
                        </div>
                        <div className="flex justify-between items-center pb-3 border-b border-slate-200 dark:border-white/10">
                            <span className="text-[10px] lg:text-sm text-slate-500 dark:text-slate-400">Booking ID</span>
                            <span className="text-[10px] lg:text-sm font-mono text-slate-700 dark:text-slate-300">{bookingResult.bookingId?.slice(0, 8) || 'N/A'}...</span>
                        </div>
                        <div className="flex justify-between items-center pb-3 border-b border-slate-200 dark:border-white/10">
                            <span className="text-[10px] lg:text-sm text-slate-500 dark:text-slate-400">Route</span>
                            <span className="text-[10px] lg:text-sm font-medium text-slate-900 dark:text-white">
                                {(offer as any).tripType === 'round-trip'
                                    ? `${primary.departure.airport} ⇌ ${primary.arrival.airport}`
                                    : `${primary.departure.airport} → ${last.arrival.airport}`}
                            </span>
                        </div>
                        <div className="flex justify-between items-center pb-3 border-b border-slate-200 dark:border-white/10">
                            <span className="text-[10px] lg:text-sm text-slate-500 dark:text-slate-400">Total</span>
                            <span className="text-[10px] lg:text-sm font-bold text-slate-900 dark:text-white">{formatPrice(offer.price.total, offer.price.currency, targetCurrency)}</span>
                        </div>
                        {bookingResult.tickets && bookingResult.tickets.length > 0 && (
                            <div className="flex justify-between items-start pt-1">
                                <span className="text-[10px] lg:text-sm text-slate-500 dark:text-slate-400 mt-1">E-Tickets</span>
                                <div className="flex flex-col items-end gap-1">
                                    {bookingResult.tickets.map((t, i) => (
                                        <div key={i} className="text-[10px] lg:text-sm flex items-center gap-2">
                                            <span className="text-slate-500 dark:text-slate-400">{t.name}</span>
                                            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded">{t.number}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
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
                        return depDate ? (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.55, type: 'spring', bounce: 0.3 }}
                                className="mb-4"
                            >
                                <div className="relative rounded-2xl overflow-hidden border-2 border-violet-400 dark:border-violet-500 shadow-lg shadow-violet-500/20">
                                    {/* Gradient background */}
                                    <div className="absolute inset-0 bg-linear-to-br from-violet-600 via-indigo-600 to-blue-600 opacity-95" />

                                    {/* Decorative circles */}
                                    <div className="absolute -top-6 -right-6 w-24 h-24 bg-white/10 rounded-full" />
                                    <div className="absolute -bottom-4 -left-4 w-16 h-16 bg-white/10 rounded-full" />

                                    {/* Bundle badge */}
                                    <div className="absolute top-3 right-3 z-20">
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400 text-amber-900 text-[10px] font-bold shadow-md">
                                            ✦ BUNDLE DEAL
                                        </span>
                                    </div>

                                    <div className="relative z-10 p-4">
                                        <div className="flex items-start gap-3 mb-3">
                                            <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                                                <BedDouble className="w-6 h-6 text-white" />
                                            </div>
                                            <div className="flex-1 pr-16">
                                                <p className="text-sm font-bold text-white leading-tight">
                                                    Add a hotel to complete your trip
                                                </p>
                                                <p className="text-xs text-violet-100 mt-0.5">
                                                    Book your stay in {dest} and save with our flight + hotel bundle rate
                                                </p>
                                            </div>
                                        </div>

                                        {/* Savings comparison */}
                                        <div className="flex items-center gap-2 mb-3 px-1">
                                            <div className="flex-1 bg-white/10 rounded-lg p-2 text-center">
                                                <p className="text-[9px] text-violet-200 font-medium">Book separately</p>
                                                <p className="text-sm font-bold text-white/60 line-through">Standard rate</p>
                                            </div>
                                            <div className="text-white/50 text-lg">→</div>
                                            <div className="flex-1 bg-amber-400/20 border border-amber-400/40 rounded-lg p-2 text-center">
                                                <p className="text-[9px] text-amber-200 font-medium">Add to this trip</p>
                                                <p className="text-sm font-bold text-amber-300">Bundle savings</p>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => router.push(hotelUrl)}
                                            className="w-full py-2.5 rounded-xl bg-white text-violet-700 font-bold text-sm flex items-center justify-center gap-2 hover:bg-violet-50 active:scale-[0.98] transition-all shadow-md"
                                        >
                                            <BedDouble className="w-4 h-4" />
                                            Find Hotels in {dest}
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
                            className="w-full py-3 lg:py-4 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-bold text-xs lg:text-base rounded-xl shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 transition-all active:scale-[0.98]"
                        >
                            View My Trips
                        </button>
                        <button
                            onClick={() => router.push('/')}
                            className="w-full py-2.5 lg:py-3 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium text-xs transition-colors"
                        >
                            Return to Home
                        </button>
                    </motion.div>
                </motion.div>
            </main>
        );
    }

    // ─── Booking Form ────────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 bg-grid-alabaster dark:bg-grid-obsidian pt-3 lg:pt-6 pb-20 px-3 lg:px-4 lg:px-6">
            <div className="max-w-3xl mx-auto">
                {/* Header */}
                <div className="mb-3 lg:mb-6">
                    <BackButton
                        bareIcon
                        className="mb-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur border border-slate-200/50 dark:border-slate-700/50 text-slate-700 dark:text-slate-300 w-8 h-8 lg:w-10 lg:h-10 rounded-full flex items-center justify-center shadow-sm !p-0"
                    />
                    <h1 className="text-base lg:text-2xl font-bold text-slate-900 dark:text-white">
                        {(offer as any).tripType === 'round-trip'
                            ? `Round trip to ${primary.arrival.airport}`
                            : 'Complete Your Booking'}
                    </h1>
                </div>

                {/* Flight Summary */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-3 lg:p-5 mb-3 lg:mb-6 shadow-sm">
                    <div className="flex items-center gap-2 lg:gap-3 mb-2 lg:mb-3">
                        <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-md lg:rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-[10px] lg:text-sm">
                            {primary.airline.code}
                        </div>
                        <div>
                            <div className="font-semibold text-slate-900 dark:text-white text-[11px] lg:text-sm">{primary.airline.name}</div>
                            <div className="text-[9px] lg:text-xs text-slate-500 dark:text-slate-400">{primary.flightNumber}</div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 lg:gap-4">
                        <div className="text-center">
                            <div className="text-[13px] lg:text-lg font-bold text-slate-900 dark:text-white">{formatTime(primary.departure.time)}</div>
                            <div className="text-[9px] lg:text-xs text-slate-500 dark:text-slate-400">{primary.departure.airport}</div>
                        </div>
                        <div className="flex-1 flex flex-col items-center gap-0.5">
                            <span className="text-[9px] lg:text-xs text-slate-400">{formatDuration(offer.totalDuration)}</span>
                            <div className="w-full h-px bg-slate-200 dark:bg-slate-700 relative">
                                <Plane className="w-3 h-3 text-indigo-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-90" />
                            </div>
                            <span className="text-[9px] lg:text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                                {offer.totalStops === 0 ? 'Nonstop' : `${offer.totalStops} stop(s)`}
                            </span>
                        </div>
                        <div className="text-center">
                            <div className="text-[13px] lg:text-lg font-bold text-slate-900 dark:text-white">{formatTime(last.arrival.time)}</div>
                            <div className="text-[9px] lg:text-xs text-slate-500 dark:text-slate-400">{last.arrival.airport}</div>
                        </div>
                        <div className="ml-auto text-right pl-2 lg:pl-4 border-l border-slate-200 dark:border-slate-700">
                            <div className="text-base lg:text-xl font-bold text-slate-900 dark:text-white">{formatPrice(offer.price.total, offer.price.currency, targetCurrency)}</div>
                            <div className="text-[9px] lg:text-xs text-slate-500 dark:text-slate-400">total price</div>
                        </div>
                    </div>
                    {offer.seatsRemaining != null && offer.seatsRemaining > 0 && (
                        <div className="mt-2 lg:mt-3 pt-2 lg:pt-3 border-t border-slate-100 dark:border-slate-800">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 lg:py-1 rounded-full text-[9px] lg:text-xs font-medium border ${
                                offer.seatsRemaining <= 3
                                    ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
                                    : offer.seatsRemaining <= 6
                                    ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
                                    : 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                            }`}>
                                <Users className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
                                {offer.seatsRemaining <= 3
                                    ? `Only ${offer.seatsRemaining} seat${offer.seatsRemaining === 1 ? '' : 's'} left!`
                                    : offer.seatsRemaining <= 6
                                    ? `${offer.seatsRemaining} seats left`
                                    : `${offer.seatsRemaining} seats available`}
                            </span>
                        </div>
                    )}
                </div>

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

                {/* Fare Rules — Mystifly only; fetched from airline via FareSourceCode */}
                {(offer.provider === 'mystifly' || offer.provider === 'mystifly_v2') && (
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
                            className="w-full mt-4 py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 font-medium rounded-xl text-sm transition-colors"
                        >
                            Back to Details
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-3 lg:space-y-6">
                        {/* Passengers */}
                        {passengers.map((pax, idx) => (
                            <div key={idx} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-3 lg:p-5">
                                <div className="flex items-center justify-between mb-3 lg:mb-4">
                                    <h2 className="flex items-center gap-1.5 lg:gap-2 text-[13px] lg:text-base font-semibold text-slate-900 dark:text-white">
                                        <User className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-indigo-500" />
                                        Passenger {idx + 1}
                                    </h2>
                                    <div className="flex items-center gap-1.5 lg:gap-2">
                                        <select
                                            value={pax.type}
                                            onChange={(e) => updatePassenger(idx, 'type', e.target.value)}
                                            className="text-[10px] lg:text-xs px-1.5 lg:px-2 py-0.5 lg:py-1 rounded-md lg:rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                                        >
                                            <option value="ADT">Adult</option>
                                            <option value="CHD">Child</option>
                                            <option value="INF">Infant</option>
                                        </select>
                                        {passengers.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removePassenger(idx)}
                                                className="text-[10px] lg:text-xs text-red-500 hover:text-red-400 font-medium"
                                            >
                                                Remove
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 lg:gap-3">
                                    <input
                                        type="text" placeholder="First Name *" required
                                        value={pax.firstName}
                                        onChange={(e) => updatePassenger(idx, 'firstName', e.target.value)}
                                        className="w-full px-2.5 lg:px-3 py-2 lg:py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-[11px] lg:text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                                    />
                                    <input
                                        type="text" placeholder="Last Name *" required
                                        value={pax.lastName}
                                        onChange={(e) => updatePassenger(idx, 'lastName', e.target.value)}
                                        className="w-full px-2.5 lg:px-3 py-2 lg:py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-[11px] lg:text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                                    />
                                    <select
                                        required value={pax.gender}
                                        onChange={(e) => updatePassenger(idx, 'gender', e.target.value)}
                                        className="w-full px-2.5 lg:px-3 py-2 lg:py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-[11px] lg:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                                    >
                                        <option value="" disabled>Gender *</option>
                                        <option value="M">Male</option>
                                        <option value="F">Female</option>
                                    </select>
                                    <input
                                        type="date" required placeholder="Date of Birth *"
                                        value={pax.birthDate}
                                        onChange={(e) => updatePassenger(idx, 'birthDate', e.target.value)}
                                        className="w-full px-2.5 lg:px-3 py-2 lg:py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-[11px] lg:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                                    />
                                    <select
                                        required value={pax.nationality}
                                        onChange={(e) => updatePassenger(idx, 'nationality', e.target.value)}
                                        className="w-full px-2.5 lg:px-3 py-2 lg:py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-[11px] lg:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                                    >
                                        <option value="KR">South Korea</option>
                                        <option value="PH">Philippines</option>
                                        <option value="US">United States</option>
                                        <option value="JP">Japan</option>
                                        <option value="CN">China</option>
                                        <option value="GB">United Kingdom</option>
                                        <option value="AU">Australia</option>
                                        <option value="CA">Canada</option>
                                        <option value="DE">Germany</option>
                                        <option value="FR">France</option>
                                        <option value="SG">Singapore</option>
                                        <option value="TH">Thailand</option>
                                        <option value="VN">Vietnam</option>
                                        <option value="IN">India</option>
                                        <option value="MY">Malaysia</option>
                                    </select>
                                    <input
                                        type="text" placeholder="Passport Number *" required
                                        value={pax.passport}
                                        onChange={(e) => updatePassenger(idx, 'passport', e.target.value)}
                                        className="w-full px-2.5 lg:px-3 py-2 lg:py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-[11px] lg:text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                                    />
                                    <label className="lg:col-span-2 space-y-0.5 lg:space-y-1">
                                        <span className="text-[9px] lg:text-xs text-slate-500 dark:text-slate-400">Passport Expiry Date *</span>
                                        <input
                                            type="date" required
                                            value={pax.passportExpiry}
                                            onChange={(e) => updatePassenger(idx, 'passportExpiry', e.target.value)}
                                            className="w-full px-2.5 lg:px-3 py-2 lg:py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-[11px] lg:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                                        />
                                    </label>
                                </div>
                            </div>
                        ))}

                        {/* Add Passenger Button */}
                        <button
                            type="button"
                            onClick={addPassenger}
                            className="w-full py-2 lg:py-2.5 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-[11px] lg:text-sm text-slate-500 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors"
                        >
                            + Add Passenger
                        </button>

                        {/* Contact Info */}
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-3 lg:p-5">
                            <h2 className="flex items-center gap-1.5 lg:gap-2 text-[13px] lg:text-base font-semibold text-slate-900 dark:text-white mb-3 lg:mb-4">
                                <Mail className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-indigo-500" />
                                Contact Information
                            </h2>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 lg:gap-3">
                                <input
                                    type="email" placeholder="Email Address *" required
                                    value={contact.email}
                                    onChange={(e) => setContact(prev => ({ ...prev, email: e.target.value }))}
                                    className="w-full px-2.5 lg:px-3 py-2 lg:py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-[11px] lg:text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                                />
                                <div className="flex gap-1.5 lg:gap-2">
                                    <select
                                        required
                                        value={contact.countryCode}
                                        onChange={(e) => setContact(prev => ({ ...prev, countryCode: e.target.value }))}
                                        className="w-[90px] lg:w-[105px] px-1.5 lg:px-2 py-2 lg:py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-[11px] lg:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                                    >
                                        <option value="82">+82 (KR)</option>
                                        <option value="63">+63 (PH)</option>
                                        <option value="1">+1 (US/CA)</option>
                                        <option value="81">+81 (JP)</option>
                                        <option value="86">+86 (CN)</option>
                                        <option value="44">+44 (GB)</option>
                                        <option value="61">+61 (AU)</option>
                                        <option value="49">+49 (DE)</option>
                                        <option value="33">+33 (FR)</option>
                                        <option value="65">+65 (SG)</option>
                                        <option value="66">+66 (TH)</option>
                                        <option value="84">+84 (VN)</option>
                                        <option value="91">+91 (IN)</option>
                                        <option value="60">+60 (MY)</option>
                                    </select>
                                    <input
                                        type="tel" placeholder="Phone Number *" required
                                        value={contact.phone}
                                        onChange={(e) => setContact(prev => ({ ...prev, phone: e.target.value }))}
                                        className="flex-1 px-2.5 lg:px-3 py-2 lg:py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-[11px] lg:text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Address */}
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-3 lg:p-5">
                            <h2 className="flex items-center gap-1.5 lg:gap-2 text-[13px] lg:text-base font-semibold text-slate-900 dark:text-white mb-3 lg:mb-4">
                                <MapPin className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-indigo-500" />
                                Billing Address
                            </h2>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 lg:gap-3">
                                <input
                                    type="text" placeholder="Address Line *" required
                                    value={contact.addressLine}
                                    onChange={(e) => setContact(prev => ({ ...prev, addressLine: e.target.value }))}
                                    className="w-full px-2.5 lg:px-3 py-2 lg:py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-[11px] lg:text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 lg:col-span-2"
                                />
                                <input
                                    type="text" placeholder="City *" required
                                    value={contact.city}
                                    onChange={(e) => setContact(prev => ({ ...prev, city: e.target.value }))}
                                    className="w-full px-2.5 lg:px-3 py-2 lg:py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-[11px] lg:text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                                />
                                <input
                                    type="text" placeholder="Postal Code *" required
                                    value={contact.postalCode}
                                    onChange={(e) => setContact(prev => ({ ...prev, postalCode: e.target.value }))}
                                    className="w-full px-2.5 lg:px-3 py-2 lg:py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-[11px] lg:text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                                />
                                <select
                                    required value={contact.country}
                                    onChange={(e) => setContact(prev => ({ ...prev, country: e.target.value }))}
                                    className="w-full px-2.5 lg:px-3 py-2 lg:py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-[11px] lg:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 lg:col-span-2"
                                >
                                    <option value="KR">South Korea</option>
                                    <option value="PH">Philippines</option>
                                    <option value="US">United States</option>
                                    <option value="JP">Japan</option>
                                    <option value="CN">China</option>
                                    <option value="GB">United Kingdom</option>
                                    <option value="AU">Australia</option>
                                    <option value="CA">Canada</option>
                                    <option value="DE">Germany</option>
                                    <option value="FR">France</option>
                                    <option value="SG">Singapore</option>
                                </select>
                            </div>
                        </div>

                        {/* ── Duffel extras: bags + seats (optional, inline) ──── */}
                        {offer.provider === 'duffel' && (
                            <div className="space-y-2">
                                {/* Bags */}
                                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => setBagsOpen(o => !o)}
                                        className="w-full flex items-center gap-3 px-3 lg:px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                                    >
                                        <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-900/30 flex items-center justify-center shrink-0">
                                            <Luggage className="w-4 h-4 text-sky-500" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[12px] lg:text-sm font-semibold text-slate-800 dark:text-slate-200">Extra Bags</p>
                                            <p className="text-[10px] lg:text-xs text-slate-400 dark:text-slate-500">
                                                {selectedBags.length > 0
                                                    ? `${selectedBags.length} bag${selectedBags.length > 1 ? 's' : ''} added · +${new Intl.NumberFormat('en-US', { style: 'currency', currency: offer.price.currency }).format(selectedBags.reduce((s, b) => s + b.price, 0))}`
                                                    : 'Optional — add checked or carry-on bags'}
                                            </p>
                                        </div>
                                        <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
                                            {bagsOpen ? '▲' : '▼'}
                                        </span>
                                    </button>
                                    {bagsOpen && (
                                        <div className="px-3 lg:px-4 pb-3 pt-1 border-t border-slate-100 dark:border-slate-800">
                                            <BagSelectionPanel
                                                offerId={(offer as any)._rawOffer?.id ?? (offer as any).resultIndex ?? offer.offerId}
                                                duffelPassengerIds={((offer as any)._rawOffer?.passengers ?? []).map((p: any) => p.id)}
                                                passengerCount={passengers.length}
                                                passengerLabels={passengers.map((p, i) => `Pax ${i + 1}${p.firstName ? ` (${p.firstName})` : ''}`)}
                                                selectedBags={selectedBags}
                                                onBagsChange={setSelectedBags}
                                                currency={offer.price.currency}
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Seats */}
                                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => setSeatsOpen(o => !o)}
                                        className="w-full flex items-center gap-3 px-3 lg:px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                                    >
                                        <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                                            <Armchair className="w-4 h-4 text-indigo-500" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[12px] lg:text-sm font-semibold text-slate-800 dark:text-slate-200">Seat Selection</p>
                                            <p className="text-[10px] lg:text-xs text-slate-400 dark:text-slate-500">
                                                {selectedSeats.length > 0
                                                    ? `${selectedSeats.length} seat${selectedSeats.length > 1 ? 's' : ''} selected · +${new Intl.NumberFormat('en-US', { style: 'currency', currency: offer.price.currency }).format(selectedSeats.reduce((s, x) => s + x.price, 0))}`
                                                    : 'Optional — pick your seat on the cabin map'}
                                            </p>
                                        </div>
                                        <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
                                            {seatsOpen ? '▲' : '▼'}
                                        </span>
                                    </button>
                                    {seatsOpen && (
                                        <div className="px-3 lg:px-4 pb-3 pt-1 border-t border-slate-100 dark:border-slate-800">
                                            <SeatMapPanel
                                                offerId={(offer as any)._rawOffer?.id ?? (offer as any).resultIndex ?? offer.offerId}
                                                segments={offer.segments.map(s => ({ origin: s.departure.airport, destination: s.arrival.airport }))}
                                                passengerCount={passengers.length}
                                                passengerLabels={passengers.map((p, i) => `Pax ${i + 1}${p.firstName ? ` (${p.firstName})` : ''}`)}
                                                selectedSeats={selectedSeats}
                                                onSeatsChange={setSelectedSeats}
                                                currency={offer.price.currency}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Status/Error Message */}
                        {errorMsg && (() => {
                            const isPending = errorMsg?.toLowerCase().includes('pending');
                            return (
                                <div className={`flex items-center gap-1.5 lg:gap-2 p-2.5 lg:p-4 rounded-lg lg:rounded-xl border ${isPending
                                    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
                                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
                                    } text-[11px] lg:text-sm`}>
                                    {isPending ? (
                                        <Info className="w-3.5 h-3.5 lg:w-4 lg:h-4 shrink-0" />
                                    ) : (
                                        <AlertTriangle className="w-3.5 h-3.5 lg:w-4 lg:h-4 shrink-0" />
                                    )}
                                    {errorMsg || 'Booking failed. Please try again.'}
                                </div>
                            );
                        })()}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={step === 'submitting'}
                            className="w-full py-2.5 lg:py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-400 text-white font-semibold text-[11px] lg:text-sm transition-colors flex items-center justify-center gap-2"
                        >
                            {step === 'submitting' ? (
                                <>
                                    <Loader2 className="w-3.5 h-3.5 lg:w-4 lg:h-4 animate-spin" />
                                    Processing Booking...
                                </>
                            ) : (
                                <>
                                    Confirm Booking · {formatPrice(
                                        offer.price.total
                                            + selectedSeats.reduce((s, x) => s + x.price, 0)
                                            + selectedBags.reduce((s, b) => s + b.price, 0),
                                        offer.price.currency,
                                        targetCurrency,
                                    )}
                                </>
                            )}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
