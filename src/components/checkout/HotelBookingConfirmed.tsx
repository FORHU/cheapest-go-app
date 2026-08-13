'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CheckCircle, PartyPopper, Mail, BedDouble, Info, CalendarDays } from 'lucide-react';
import { Confetti, Balloons } from '@/components/ui/Animations';
import { getCurrencySymbol } from '@/lib/currency';

interface HotelBookingConfirmedProps {
    propertyName: string;
    propertyImage?: string;
    bookingId: string | null | undefined;
    roomTitle: string;
    checkIn: Date | null;
    checkOut: Date | null;
    chargedTotal: number;
    currency: string;
}

const dateFmt = (d: Date | null) =>
    d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export function HotelBookingConfirmed({
    propertyName,
    propertyImage,
    bookingId,
    roomTitle,
    checkIn,
    checkOut,
    chargedTotal,
    currency,
}: HotelBookingConfirmedProps) {
    const t = useTranslations('checkout.success');
    const router = useRouter();
    const symbol = getCurrencySymbol(currency);

    return (
        <main className="min-h-screen pt-6 lg:pt-24 pb-20 px-3 lg:px-4 flex items-center justify-center relative overflow-hidden bg-linear-to-br from-emerald-50/60 via-white/40 to-indigo-50/60 dark:from-slate-950/60 dark:via-slate-900/40 dark:to-emerald-950/60">
            <Confetti count={80} />
            <Balloons count={12} />

            {/* Animated background blobs */}
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
                {/* Success icon */}
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: 'spring', bounce: 0.6 }}
                    className="relative mx-auto mb-4 lg:mb-6 w-16 lg:w-20 flex justify-center"
                >
                    <motion.div
                        className="w-16 h-16 lg:w-20 lg:h-20 bg-linear-to-br from-emerald-400 to-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/30"
                        animate={{ boxShadow: ['0 10px 30px rgba(16,185,129,0.3)', '0 10px 50px rgba(16,185,129,0.5)', '0 10px 30px rgba(16,185,129,0.3)'] }}
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
                    {t('bookingConfirmed')}
                </motion.h1>

                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="text-[11px] lg:text-sm text-slate-500 dark:text-slate-400 mb-4 lg:mb-6"
                >
                    {t('hotelSuccess')}
                </motion.p>

                {/* Booking details */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="bg-linear-to-br from-slate-50 to-slate-100 dark:from-white/5 dark:to-white/10 p-3.5 lg:p-5 rounded-xl lg:rounded-2xl mb-4 lg:mb-6 text-left border border-slate-200/50 dark:border-white/5 space-y-3 lg:space-y-4"
                >
                    {bookingId && (
                        <div className="flex justify-between items-center pb-3 border-b border-slate-200 dark:border-white/10">
                            <span className="text-[9px] lg:text-xs text-slate-500 dark:text-slate-400">{t('bookingId')}</span>
                            <span className="text-[9px] lg:text-xs font-mono font-normal text-slate-900 dark:text-white">
                                {bookingId.length > 20 ? `${bookingId.slice(0, 20)}…` : bookingId}
                            </span>
                        </div>
                    )}

                    {propertyImage && (
                        <div className="flex items-center gap-3 pb-3 border-b border-slate-200 dark:border-white/10">
                            <img src={propertyImage} alt={propertyName} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                            <span className="text-[10px] lg:text-sm font-medium text-slate-900 dark:text-white leading-tight">{propertyName}</span>
                        </div>
                    )}
                    {!propertyImage && (
                        <div className="flex justify-between items-center pb-3 border-b border-slate-200 dark:border-white/10">
                            <span className="text-[9px] lg:text-xs text-slate-500 dark:text-slate-400">{t('hotel')}</span>
                            <span className="text-[9px] lg:text-xs font-normal text-slate-900 dark:text-white">{propertyName}</span>
                        </div>
                    )}

                    <div className="flex justify-between items-center pb-3 border-b border-slate-200 dark:border-white/10">
                        <span className="text-[9px] lg:text-xs text-slate-500 dark:text-slate-400">{t('room')}</span>
                        <span className="text-[9px] lg:text-xs font-normal text-slate-900 dark:text-white">{roomTitle}</span>
                    </div>

                    <div className="flex justify-between items-center pb-3 border-b border-slate-200 dark:border-white/10">
                        <span className="text-[9px] lg:text-xs text-slate-500 dark:text-slate-400">{t('checkIn')}</span>
                        <span className="text-[9px] lg:text-xs font-normal text-slate-900 dark:text-white">{dateFmt(checkIn)}</span>
                    </div>

                    <div className="flex justify-between items-center pb-3 border-b border-slate-200 dark:border-white/10">
                        <span className="text-[9px] lg:text-xs text-slate-500 dark:text-slate-400">{t('checkOut')}</span>
                        <span className="text-[9px] lg:text-xs font-normal text-slate-900 dark:text-white">{dateFmt(checkOut)}</span>
                    </div>

                    <div className="flex justify-between items-center">
                        <span className="text-[10px] lg:text-sm text-slate-500 dark:text-slate-400">{t('total')}</span>
                        <span className="text-[10px] lg:text-sm font-normal text-slate-900 dark:text-white">
                            {symbol}{chargedTotal.toLocaleString()}
                        </span>
                    </div>
                </motion.div>

                {/* What's next */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.52 }}
                    className="mb-4 text-left"
                >
                    <p className="text-[10px] lg:text-xs font-normal text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">{t('whatsNext')}</p>
                    <div className="space-y-2">
                        <div className="flex items-start gap-2.5">
                            <div className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0 mt-0.5">
                                <Mail className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <p className="text-[10px] lg:text-[11px] text-slate-600 dark:text-slate-400">{t('emailInfo')}</p>
                        </div>
                        <div className="flex items-start gap-2.5">
                            <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0 mt-0.5">
                                <BedDouble className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <p className="text-[10px] lg:text-[11px] text-slate-600 dark:text-slate-400">{t('hotelCheckInInfo')}</p>
                        </div>
                        <div className="flex items-start gap-2.5">
                            <div className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0 mt-0.5">
                                <CalendarDays className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                            </div>
                            <p className="text-[10px] lg:text-[11px] text-slate-600 dark:text-slate-400">{t('freeCancellationInfo')}</p>
                        </div>
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
                        className="w-full py-3 lg:py-4 bg-linear-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-bold text-xs lg:text-base rounded-xl shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 transition-all active:scale-[0.98]"
                    >
                        {t('viewMyTrips')}
                    </button>
                    <button
                        onClick={() => router.push('/')}
                        className="w-full py-2.5 lg:py-3 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-normal text-xs transition-colors"
                    >
                        {t('returnToHome')}
                    </button>
                </motion.div>
            </motion.div>
        </main>
    );
}
