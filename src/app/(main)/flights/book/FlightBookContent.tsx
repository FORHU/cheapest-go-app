"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Plane, User, Mail, Loader2, CheckCircle, AlertTriangle, MapPin, PartyPopper, Info, Clock } from 'lucide-react';
import BackButton from '@/components/common/BackButton';
import StripeEmbeddedCheckout from '@/components/checkout/StripeEmbeddedCheckout';
import { Confetti, Balloons } from '@/components/ui/Animations';
import { formatTime, formatDuration, formatPrice } from '@/lib/flights/utils';
import { useFlightBooking } from '@/hooks/flights/useFlightBooking';

// ─── Component ───────────────────────────────────────────────────────

export default function FlightBookContent() {
    const {
        offer,
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
        router,
        clientSecret,
        setStep,
        pollForBooking,
    } = useFlightBooking();

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
                            <span className="text-[10px] lg:text-sm font-bold text-slate-900 dark:text-white">{formatPrice(offer.price.total, offer.price.currency)}</span>
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
                            <div className="text-base lg:text-xl font-bold text-slate-900 dark:text-white">{formatPrice(offer.price.total, offer.price.currency)}</div>
                            <div className="text-[9px] lg:text-xs text-slate-500 dark:text-slate-400">total price</div>
                        </div>
                    </div>
                </div>

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

                        {/* Status/Error Message */}
                        {(errorMsg || step === 'error') && (() => {
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
                                    Confirm Booking · {formatPrice(offer.price.total, offer.price.currency)}
                                </>
                            )}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
