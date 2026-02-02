'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { CheckCircle, PartyPopper, MapPin, Calendar, Mail } from 'lucide-react';
import { Header, Footer } from '@/components/landing';
import { Confetti, Balloons } from '@/components/ui/Animations';

interface BookingSuccessProps {
    propertyName: string;
    bookingId: string | null | undefined;
    checkIn: Date | null;
    checkOut: Date | null;
    email: string;
    emailSent: boolean;
}

export function BookingSuccess({
    propertyName,
    bookingId,
    checkIn,
    checkOut,
    email,
    emailSent,
}: BookingSuccessProps) {
    const router = useRouter();

    return (
        <>
            <Header />
            <main className="min-h-screen pt-6 pb-20 px-4 flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950">
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
                    className="relative z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-8 rounded-3xl shadow-2xl max-w-md w-full text-center border border-white/50 dark:border-white/10"
                >
                    {/* Success Icon with Animation */}
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: 'spring', bounce: 0.6 }}
                        className="relative mx-auto mb-6"
                    >
                        <motion.div
                            className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-green-500 rounded-full flex items-center justify-center shadow-lg shadow-green-500/30"
                            animate={{ boxShadow: ['0 10px 30px rgba(34, 197, 94, 0.3)', '0 10px 50px rgba(34, 197, 94, 0.5)', '0 10px 30px rgba(34, 197, 94, 0.3)'] }}
                            transition={{ duration: 2, repeat: Infinity }}
                        >
                            <CheckCircle size={40} className="text-white" strokeWidth={2.5} />
                        </motion.div>
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.4, type: 'spring' }}
                            className="absolute -top-1 -right-1 w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center shadow-md"
                        >
                            <PartyPopper size={16} className="text-yellow-800" />
                        </motion.div>
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="text-2xl font-bold text-slate-900 dark:text-white mb-2"
                    >
                        Booking Confirmed! 🎉
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        className="text-slate-500 dark:text-slate-400 mb-6"
                    >
                        Your reservation at <span className="font-semibold text-emerald-600 dark:text-emerald-400">{propertyName}</span> is complete.
                    </motion.p>

                    {/* Booking Details Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                        className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-white/5 dark:to-white/10 p-5 rounded-2xl mb-6 text-left border border-slate-200/50 dark:border-white/5"
                    >
                        <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-200 dark:border-white/10">
                            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                                <MapPin size={18} className="text-blue-600 dark:text-blue-400" />
                            </div>
                            <div className="flex-1">
                                <p className="text-xs text-slate-500 dark:text-slate-400">Booking ID</p>
                                <p className="font-mono font-bold text-slate-900 dark:text-white text-sm">{bookingId}</p>
                            </div>
                        </div>

                        {checkIn && checkOut && (
                            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-200 dark:border-white/10">
                                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                                    <Calendar size={18} className="text-purple-600 dark:text-purple-400" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Stay Duration</p>
                                    <p className="font-medium text-slate-900 dark:text-white text-sm">
                                        {checkIn.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {checkOut.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                                <Mail size={18} className="text-green-600 dark:text-green-400" />
                            </div>
                            <div className="flex-1">
                                <p className="text-xs text-slate-500 dark:text-slate-400">Confirmation sent to</p>
                                <p className="font-medium text-slate-900 dark:text-white text-sm">{email}</p>
                            </div>
                            {emailSent && (
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded-full"
                                >
                                    <CheckCircle size={12} />
                                    Sent
                                </motion.div>
                            )}
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6 }}
                        className="space-y-3"
                    >
                        <button
                            onClick={() => router.push('/trips')}
                            className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold rounded-xl shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all active:scale-[0.98]"
                        >
                            View My Trips
                        </button>
                        <button
                            onClick={() => router.push('/')}
                            className="w-full py-3 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium transition-colors"
                        >
                            Return to Home
                        </button>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                            Check your email for booking details and updates
                        </p>
                    </motion.div>
                </motion.div>
            </main>
            <Footer />
        </>
    );
}
