'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { CheckCircle, PartyPopper, MapPin, Calendar, Mail, Plane, Sparkles } from 'lucide-react';
import { Confetti, Balloons } from '@/components/ui/Animations';

interface BookingSuccessProps {
    propertyName: string;
    bookingId: string | null | undefined;
    checkIn: Date | null;
    checkOut: Date | null;
    email: string;
    emailSent: boolean;
    bundleFlightId?: string;
    bundleSavings?: number;
    currency?: string;
    // Hotel destination — used to build the "add a flight" upsell CTA
    hotelDestination?: string;
}

export function BookingSuccess({
    propertyName,
    bookingId,
    checkIn,
    checkOut,
    email,
    emailSent,
    bundleFlightId,
    bundleSavings,
    currency = 'USD',
    hotelDestination,
}: BookingSuccessProps) {
    const router = useRouter();
    const [hasAlreadyBookedFlight, setHasAlreadyBookedFlight] = React.useState(false);

    React.useEffect(() => {
        if (typeof window !== 'undefined') {
            setHasAlreadyBookedFlight(sessionStorage.getItem('hasAlreadyBookedFlight') === 'true');
        }
    }, []);

    // Build hotel → flight upsell URL.
    // Suggest flying IN near check-in, flying HOME near check-out.
    const flightUpsellUrl = (() => {
        if (bundleFlightId || !bookingId) return null; // already bundled with a flight
        const params = new URLSearchParams();
        params.set('mode', 'flights');
        params.set('bundleHotelId', bookingId);
        if (checkIn) params.set('departure', checkIn.toISOString().slice(0, 10));
        return `/?${params.toString()}`;
    })();

    return (
        <main className="min-h-screen pt-6 pb-20 px-4 flex items-center justify-center relative overflow-hidden bg-linear-to-br from-emerald-50/60 via-white/40 to-blue-50/60 dark:from-slate-950/60 dark:via-slate-900/40 dark:to-emerald-950/60">
            {/* Celebration Effects */}
            <Confetti count={80} />
            <Balloons count={12} />

            {/* Animated background circles */}
            <motion.div
                className="absolute top-20 left-10 w-72 h-72 bg-green-300/20 dark:bg-green-500/10 rounded-full blur-3xl"
                animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
                transition={{ duration: 4, repeat: Infinity }}
            />
            <motion.div
                className="absolute bottom-20 right-10 w-96 h-96 bg-blue-300/20 dark:bg-blue-500/10 rounded-full blur-3xl"
                animate={{ scale: [1.2, 1, 1.2], opacity: [0.3, 0.5, 0.3] }}
                transition={{ duration: 5, repeat: Infinity }}
            />

            <motion.div
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.5, type: 'spring', bounce: 0.4 }}
                className="relative z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-5 sm:p-8 rounded-2xl sm:rounded-3xl shadow-2xl max-w-md w-full text-center border border-white/50 dark:border-white/10"
            >
                {/* Success Icon with Animation */}
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: 'spring', bounce: 0.6 }}
                    className="relative mx-auto mb-4 sm:mb-6"
                >
                    <motion.div
                        className="w-16 h-16 sm:w-20 sm:h-20 bg-linear-to-br from-emerald-400 to-green-500 rounded-full flex items-center justify-center shadow-lg shadow-green-500/30"
                        animate={{ boxShadow: ['0 10px 30px rgba(34, 197, 94, 0.3)', '0 10px 50px rgba(34, 197, 94, 0.5)', '0 10px 30px rgba(34, 197, 94, 0.3)'] }}
                        transition={{ duration: 2, repeat: Infinity }}
                    >
                        <CheckCircle className="text-white w-8 h-8 sm:w-10 sm:h-10" strokeWidth={2.5} />
                    </motion.div>
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.4, type: 'spring' }}
                        className="absolute -top-1 -right-1 w-6 h-6 sm:w-8 sm:h-8 bg-yellow-400 rounded-full flex items-center justify-center shadow-md"
                    >
                        <PartyPopper className="text-yellow-800 w-3 h-3 sm:w-4 sm:h-4" />
                    </motion.div>
                </motion.div>

                <motion.h1
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-1.5 sm:mb-2"
                >
                    Booking Confirmed! 🎉
                </motion.h1>

                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="text-[13px] sm:text-base text-slate-500 dark:text-slate-400 mb-4 sm:mb-6"
                >
                    Your reservation at <span className="font-semibold text-emerald-600 dark:text-emerald-400">{propertyName}</span> is complete.
                </motion.p>

                {/* Booking Details Card */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="bg-linear-to-br from-slate-50 to-slate-100 dark:from-white/5 dark:to-white/10 p-4 sm:p-5 rounded-xl sm:rounded-2xl mb-4 sm:mb-6 text-left border border-slate-200/50 dark:border-white/5"
                >
                    <div className="flex items-center gap-2.5 sm:gap-3 mb-3 sm:mb-4 pb-3 sm:pb-4 border-b border-slate-200 dark:border-white/10">
                        <div className="p-1.5 sm:p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                            <MapPin className="text-blue-600 dark:text-blue-400 w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                        </div>
                        <div className="flex-1">
                            <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">Booking ID</p>
                            <p className="font-mono font-bold text-slate-900 dark:text-white text-[13px] sm:text-sm">{bookingId}</p>
                        </div>
                    </div>

                    {checkIn && checkOut && (
                        <div className="flex items-center gap-2.5 sm:gap-3 mb-3 sm:mb-4 pb-3 sm:pb-4 border-b border-slate-200 dark:border-white/10">
                            <div className="p-1.5 sm:p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                                <Calendar className="text-purple-600 dark:text-purple-400 w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                            </div>
                            <div className="flex-1">
                                <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">Stay Duration</p>
                                <p className="font-medium text-slate-900 dark:text-white text-[13px] sm:text-sm">
                                    {checkIn.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {checkOut.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </p>
                            </div>
                        </div>
                    )}

                    <div className={`flex items-center gap-2.5 sm:gap-3 ${bundleFlightId ? 'mb-3 sm:mb-4 pb-3 sm:pb-4 border-b border-slate-200 dark:border-white/10' : ''}`}>
                        <div className="p-1.5 sm:p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                            <Mail className="text-green-600 dark:text-green-400 w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">Confirmation sent to</p>
                            <p className="font-medium text-slate-900 dark:text-white text-[12px] sm:text-sm truncate">{email}</p>
                        </div>
                        {emailSent && (
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="flex items-center gap-1 text-[10px] sm:text-xs text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full shrink-0"
                            >
                                <CheckCircle size={10} className="sm:w-3 sm:h-3" />
                                Sent
                            </motion.div>
                        )}
                    </div>

                    {bundleFlightId && (
                        <motion.div
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.65 }}
                            className="flex items-center gap-2.5 sm:gap-3 px-3 py-2.5 bg-linear-to-r from-violet-50 to-indigo-50 dark:from-violet-900/20 dark:to-indigo-900/20 rounded-xl border border-violet-200/60 dark:border-violet-700/30"
                        >
                            <div className="p-1.5 bg-violet-100 dark:bg-violet-900/40 rounded-lg shrink-0">
                                <Plane className="text-violet-600 dark:text-violet-400 w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] sm:text-xs text-violet-500 dark:text-violet-400">Flight + Hotel Bundle</p>
                                <p className="font-medium text-violet-900 dark:text-violet-200 text-[12px] sm:text-sm">
                                    Bundle discount applied
                                </p>
                            </div>
                            {bundleSavings && bundleSavings > 0 && (
                                <span className="shrink-0 px-2 py-0.5 rounded-full bg-amber-400 text-amber-900 text-[10px] sm:text-xs font-bold">
                                    -{new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(bundleSavings)} saved
                                </span>
                            )}
                        </motion.div>
                    )}
                </motion.div>

                {/* Hotel → Flight bundle upsell (only when not already bundled) */}
                {flightUpsellUrl && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.65 }}
                        className="mb-4 sm:mb-5 p-3.5 sm:p-4 rounded-xl bg-linear-to-r from-violet-50 to-indigo-50 dark:from-violet-900/20 dark:to-indigo-900/20 border border-violet-200/60 dark:border-violet-700/30 text-left"
                    >
                        <div className="flex items-start gap-2.5 mb-3">
                            <div className="p-1.5 bg-violet-100 dark:bg-violet-900/40 rounded-lg shrink-0 mt-0.5">
                                <Plane className="text-violet-600 dark:text-violet-400 w-4 h-4" />
                            </div>
                            <div>
                                <div className="flex items-center gap-1.5 mb-0.5">
                                    <p className="text-xs font-bold text-violet-700 dark:text-violet-300 uppercase tracking-wide">✦ Bundle Deal</p>
                                    <span className="px-1.5 py-px text-[9px] font-bold bg-amber-400 text-amber-900 rounded-full">Save up to 8%</span>
                                </div>
                                <p className="text-[12px] sm:text-sm text-violet-800 dark:text-violet-200 font-medium">
                                    Need a flight to {hotelDestination || propertyName}?
                                </p>
                                <p className="text-[10px] sm:text-xs text-violet-600/80 dark:text-violet-400/80 mt-0.5">
                                    Book your flight now and get a bundle discount on your total.
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => router.push(flightUpsellUrl)}
                            className="w-full py-2 text-xs sm:text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 active:scale-[0.98]"
                        >
                            <Sparkles size={13} />
                            Search flights &amp; bundle
                        </button>
                    </motion.div>
                )}

                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                    className="space-y-2 sm:space-y-3"
                >
                    <button
                        onClick={() => router.push('/trips')}
                        className="w-full py-2.5 sm:py-4 text-[13px] sm:text-base bg-linear-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold rounded-lg sm:rounded-xl shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all active:scale-[0.98]"
                    >
                        View My Trips
                    </button>
                    <button
                        onClick={() => router.push('/')}
                        className="w-full py-2 sm:py-3 text-[13px] sm:text-base text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium transition-colors"
                    >
                        Return to Home
                    </button>
                    <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500">
                        Check your email for booking details and updates
                    </p>
                </motion.div>
            </motion.div>
        </main>
    );
}
