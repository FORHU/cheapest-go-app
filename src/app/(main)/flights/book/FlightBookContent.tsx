"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Plane, User, Mail, ArrowLeft, Loader2, CheckCircle, AlertTriangle, MapPin } from 'lucide-react';
import type { FlightOffer } from '@/lib/flights/types';
import { getAirlineName } from '@/lib/flights/types';
import { createClient } from '@/utils/supabase/client';

// ─── Types ───────────────────────────────────────────────────────────

interface PassengerForm {
    type: 'ADT' | 'CHD' | 'INF';
    firstName: string;
    lastName: string;
    gender: string;
    birthDate: string;
    nationality: string;
    passport: string;
    passportExpiry: string;
}

interface ContactForm {
    email: string;
    phone: string;
    countryCode: string;
    addressLine: string;
    city: string;
    postalCode: string;
    country: string;
}

type BookingStep = 'form' | 'submitting' | 'success' | 'error';

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
        style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(amount);
}

// ─── Component ───────────────────────────────────────────────────────

export default function FlightBookContent() {
    const router = useRouter();
    const [offer, setOffer] = useState<FlightOffer | null>(null);
    const [step, setStep] = useState<BookingStep>('form');
    const [errorMsg, setErrorMsg] = useState('');
    const [bookingResult, setBookingResult] = useState<{ bookingId: string; pnr: string } | null>(null);

    // Passenger state
    const [passengers, setPassengers] = useState<PassengerForm[]>([{
        type: 'ADT', firstName: '', lastName: '', gender: '', birthDate: '',
        nationality: 'KR', passport: '', passportExpiry: '',
    }]);

    // Contact state
    const [contact, setContact] = useState<ContactForm>({
        email: '', phone: '', countryCode: '82',
        addressLine: '', city: '', postalCode: '', country: 'KR',
    });

    // Load selected flight from sessionStorage
    useEffect(() => {
        const raw = sessionStorage.getItem('selectedFlight');
        if (!raw) {
            router.replace('/');
            return;
        }
        try {
            setOffer(JSON.parse(raw));
        } catch {
            router.replace('/');
        }
    }, [router]);

    // ─── Update Passenger ────────────────────────────────────────────

    const updatePassenger = (idx: number, field: keyof PassengerForm, value: string) => {
        setPassengers(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
    };

    const addPassenger = () => {
        setPassengers(prev => [...prev, {
            type: 'ADT', firstName: '', lastName: '', gender: '', birthDate: '',
            nationality: 'KR', passport: '', passportExpiry: '',
        }]);
    };

    const removePassenger = (idx: number) => {
        if (passengers.length <= 1) return;
        setPassengers(prev => prev.filter((_, i) => i !== idx));
    };

    // ─── Submit Booking ──────────────────────────────────────────────

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!offer) return;

        // Basic validation
        for (let i = 0; i < passengers.length; i++) {
            const p = passengers[i];
            if (!p.firstName.trim() || !p.lastName.trim()) {
                setErrorMsg(`Passenger ${i + 1}: First and last name are required`);
                return;
            }
            if (!p.gender) {
                setErrorMsg(`Passenger ${i + 1}: Gender is required`);
                return;
            }
            if (!p.birthDate) {
                setErrorMsg(`Passenger ${i + 1}: Date of birth is required`);
                return;
            }
            if (!p.passport.trim()) {
                setErrorMsg(`Passenger ${i + 1}: Passport number is required`);
                return;
            }
            if (!p.passportExpiry) {
                setErrorMsg(`Passenger ${i + 1}: Passport expiry date is required`);
                return;
            }
        }
        if (!contact.email.trim() || !contact.phone.trim()) {
            setErrorMsg('Contact email and phone are required');
            return;
        }
        if (!contact.addressLine.trim() || !contact.city.trim() || !contact.postalCode.trim()) {
            setErrorMsg('Billing address is required');
            return;
        }

        setStep('submitting');
        setErrorMsg('');

        try {
            // Get current user ID
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                router.push('/login');
                return;
            }

            // Build the flight object for the booking session
            const flightPayload = {
                traceId: (offer as any).traceId ?? offer.offerId,
                resultIndex: (offer as any).resultIndex ?? offer.offerId,
                price: offer.price.total,
                currency: offer.price.currency,
                validatingAirline: offer.validatingAirline ?? offer.segments[0]?.airline.code,
                segments: offer.segments.map(seg => ({
                    airline: seg.airline.code,
                    airlineName: seg.airline.name,
                    flightNumber: seg.flightNumber,
                    origin: seg.departure.airport,
                    destination: seg.arrival.airport,
                    departureTime: seg.departure.time,
                    arrivalTime: seg.arrival.time,
                    cabinClass: seg.cabinClass,
                })),
                rawOffer: (offer as any)._raw,
            };

            const res = await fetch('/api/flights/book', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.id,
                    provider: offer.provider,
                    flight: flightPayload,
                    passengers,
                    contact,
                }),
            });

            const data = await res.json();

            if (!data.success) {
                throw new Error(data.error || 'Booking failed');
            }

            setBookingResult({ bookingId: data.data.bookingId, pnr: data.data.pnr });
            setStep('success');
            sessionStorage.removeItem('selectedFlight');
        } catch (err: any) {
            setErrorMsg(err.message || 'Booking failed. Please try again.');
            setStep('error');
        }
    };

    // ─── Loading ─────────────────────────────────────────────────────

    if (!offer) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
        );
    }

    const primary = offer.segments[0];
    const last = offer.segments[offer.segments.length - 1];

    // ─── Success State ───────────────────────────────────────────────

    if (step === 'success' && bookingResult) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 pt-24 pb-16">
                <div className="max-w-2xl mx-auto px-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center"
                    >
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                            <CheckCircle className="w-8 h-8 text-emerald-500" />
                        </div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Booking Confirmed!</h1>
                        <p className="text-slate-500 dark:text-slate-400 mb-6">Your flight has been booked successfully.</p>

                        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 mb-6 text-left space-y-2">
                            <div className="flex justify-between">
                                <span className="text-sm text-slate-500 dark:text-slate-400">PNR</span>
                                <span className="text-sm font-mono font-bold text-slate-900 dark:text-white">{bookingResult.pnr}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-sm text-slate-500 dark:text-slate-400">Booking ID</span>
                                <span className="text-sm font-mono text-slate-700 dark:text-slate-300">{bookingResult.bookingId.slice(0, 8)}...</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-sm text-slate-500 dark:text-slate-400">Route</span>
                                <span className="text-sm text-slate-900 dark:text-white">{primary.departure.airport} → {last.arrival.airport}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-sm text-slate-500 dark:text-slate-400">Total</span>
                                <span className="text-sm font-semibold text-slate-900 dark:text-white">{formatPrice(offer.price.total, offer.price.currency)}</span>
                            </div>
                        </div>

                        <div className="flex gap-3 justify-center">
                            <button
                                onClick={() => router.push('/trips')}
                                className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-colors"
                            >
                                View My Trips
                            </button>
                            <button
                                onClick={() => router.push('/')}
                                className="px-6 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium text-sm transition-colors"
                            >
                                Back to Home
                            </button>
                        </div>
                    </motion.div>
                </div>
            </div>
        );
    }

    // ─── Booking Form ────────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 pt-24 pb-16">
            <div className="max-w-3xl mx-auto px-4">
                {/* Header */}
                <div className="mb-6">
                    <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-indigo-500 transition-colors mb-2">
                        <ArrowLeft className="w-4 h-4" /> Back to results
                    </button>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Complete Your Booking</h1>
                </div>

                {/* Flight Summary */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5 mb-6">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                            {primary.airline.code}
                        </div>
                        <div>
                            <div className="font-semibold text-slate-900 dark:text-white text-sm">{primary.airline.name}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">{primary.flightNumber}</div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="text-center">
                            <div className="text-lg font-bold text-slate-900 dark:text-white">{formatTime(primary.departure.time)}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">{primary.departure.airport}</div>
                        </div>
                        <div className="flex-1 flex flex-col items-center gap-0.5">
                            <span className="text-xs text-slate-400">{formatDuration(offer.totalDuration)}</span>
                            <div className="w-full h-px bg-slate-200 dark:bg-slate-700 relative">
                                <Plane className="w-3 h-3 text-indigo-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-90" />
                            </div>
                            <span className="text-xs text-emerald-600 dark:text-emerald-400">
                                {offer.totalStops === 0 ? 'Nonstop' : `${offer.totalStops} stop(s)`}
                            </span>
                        </div>
                        <div className="text-center">
                            <div className="text-lg font-bold text-slate-900 dark:text-white">{formatTime(last.arrival.time)}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">{last.arrival.airport}</div>
                        </div>
                        <div className="ml-auto text-right pl-4 border-l border-slate-200 dark:border-slate-700">
                            <div className="text-xl font-bold text-slate-900 dark:text-white">{formatPrice(offer.price.total, offer.price.currency)}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">total price</div>
                        </div>
                    </div>
                </div>

                {/* Booking Form */}
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Passengers */}
                    {passengers.map((pax, idx) => (
                        <div key={idx} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                                    <User className="w-4 h-4 text-indigo-500" />
                                    Passenger {idx + 1}
                                </h2>
                                <div className="flex items-center gap-2">
                                    <select
                                        value={pax.type}
                                        onChange={(e) => updatePassenger(idx, 'type', e.target.value)}
                                        className="text-xs px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                                    >
                                        <option value="ADT">Adult</option>
                                        <option value="CHD">Child</option>
                                        <option value="INF">Infant</option>
                                    </select>
                                    {passengers.length > 1 && (
                                        <button type="button" onClick={() => removePassenger(idx)} className="text-xs text-red-500 hover:text-red-400">
                                            Remove
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <input
                                    type="text" placeholder="First Name *" required
                                    value={pax.firstName}
                                    onChange={(e) => updatePassenger(idx, 'firstName', e.target.value)}
                                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                                />
                                <input
                                    type="text" placeholder="Last Name *" required
                                    value={pax.lastName}
                                    onChange={(e) => updatePassenger(idx, 'lastName', e.target.value)}
                                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                                />
                                <select
                                    required value={pax.gender}
                                    onChange={(e) => updatePassenger(idx, 'gender', e.target.value)}
                                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                                >
                                    <option value="" disabled>Gender *</option>
                                    <option value="M">Male</option>
                                    <option value="F">Female</option>
                                </select>
                                <input
                                    type="date" required placeholder="Date of Birth *"
                                    value={pax.birthDate}
                                    onChange={(e) => updatePassenger(idx, 'birthDate', e.target.value)}
                                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                                />
                                <select
                                    required value={pax.nationality}
                                    onChange={(e) => updatePassenger(idx, 'nationality', e.target.value)}
                                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
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
                                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                                />
                                <label className="sm:col-span-2 space-y-1">
                                    <span className="text-xs text-slate-500 dark:text-slate-400">Passport Expiry Date *</span>
                                    <input
                                        type="date" required
                                        value={pax.passportExpiry}
                                        onChange={(e) => updatePassenger(idx, 'passportExpiry', e.target.value)}
                                        className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                                    />
                                </label>
                            </div>
                        </div>
                    ))}

                    {/* Add Passenger Button */}
                    <button
                        type="button"
                        onClick={addPassenger}
                        className="w-full py-2.5 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-sm text-slate-500 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors"
                    >
                        + Add Passenger
                    </button>

                    {/* Contact Info */}
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                        <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white mb-4">
                            <Mail className="w-4 h-4 text-indigo-500" />
                            Contact Information
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <input
                                type="email" placeholder="Email Address *" required
                                value={contact.email}
                                onChange={(e) => setContact(prev => ({ ...prev, email: e.target.value }))}
                                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                            />
                            <div className="flex gap-2">
                                <input
                                    type="text" placeholder="+" required
                                    value={contact.countryCode}
                                    onChange={(e) => setContact(prev => ({ ...prev, countryCode: e.target.value.replace(/\D/g, '') }))}
                                    className="w-16 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm text-center placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                                />
                                <input
                                    type="tel" placeholder="Phone Number *" required
                                    value={contact.phone}
                                    onChange={(e) => setContact(prev => ({ ...prev, phone: e.target.value }))}
                                    className="flex-1 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Address */}
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                        <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white mb-4">
                            <MapPin className="w-4 h-4 text-indigo-500" />
                            Billing Address
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <input
                                type="text" placeholder="Address Line *" required
                                value={contact.addressLine}
                                onChange={(e) => setContact(prev => ({ ...prev, addressLine: e.target.value }))}
                                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 sm:col-span-2"
                            />
                            <input
                                type="text" placeholder="City *" required
                                value={contact.city}
                                onChange={(e) => setContact(prev => ({ ...prev, city: e.target.value }))}
                                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                            />
                            <input
                                type="text" placeholder="Postal Code *" required
                                value={contact.postalCode}
                                onChange={(e) => setContact(prev => ({ ...prev, postalCode: e.target.value }))}
                                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                            />
                            <select
                                required value={contact.country}
                                onChange={(e) => setContact(prev => ({ ...prev, country: e.target.value }))}
                                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 sm:col-span-2"
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

                    {/* Error Message */}
                    {(errorMsg || step === 'error') && (
                        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            {errorMsg || 'Booking failed. Please try again.'}
                        </div>
                    )}

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={step === 'submitting'}
                        className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-400 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                    >
                        {step === 'submitting' ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Processing Booking...
                            </>
                        ) : (
                            <>
                                Confirm Booking · {formatPrice(offer.price.total, offer.price.currency)}
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
