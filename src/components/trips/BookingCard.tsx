"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { MapPin, XCircle, Pencil, CheckCircle, RotateCcw, Ban, CalendarCheck, User, Download, AlertTriangle, Map, ChevronRight } from 'lucide-react';

const TripMapView = dynamic(() => import('./TripMapView'), { ssr: false });
import { cn } from '@/lib/utils';
import type { BookingRecord } from '@/services/booking.service';
import CancellationModal from './CancellationModal';
import ModificationModal from './ModificationModal';
import { statusColors, statusLabels } from '@/lib/constants';
import { formatDate, formatCurrency, calculateNights } from '@/lib/utils';
import type { BookingPolicyType } from '@/types/booking-policy';
import { convertCurrency } from '@/lib/currency';
import { useUserCurrency } from '@/stores/searchStore';

interface BookingCardProps {
    booking: BookingRecord;
    onBookingUpdated?: () => void;
    index?: number;
}

function getRatingLabel(rating: number, t: (key: string) => string): string {
    if (rating >= 9) return t('bookingCard.ratings.exceptional');
    if (rating >= 8) return t('bookingCard.ratings.excellent');
    if (rating >= 7) return t('bookingCard.ratings.veryGood');
    if (rating >= 6) return t('bookingCard.ratings.good');
    return t('bookingCard.ratings.pleasant');
}

function getRatingColor(rating: number): string {
    if (rating >= 9) return 'bg-indigo-600';
    if (rating >= 8) return 'bg-emerald-500';
    if (rating >= 7) return 'bg-teal-500';
    if (rating >= 6) return 'bg-blue-500';
    return 'bg-amber-500';
}

export default function BookingCard({ booking, onBookingUpdated, index = 0 }: BookingCardProps) {
    const t = useTranslations('trips');
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [showModifyModal, setShowModifyModal] = useState(false);
    const [showMapView, setShowMapView]         = useState(false);
    const liveUserCurrency = useUserCurrency();
    const bookingCurrency = booking.currency || 'USD';
    const [displayPrice, setDisplayPrice] = useState(booking.total_price);
    const [displayCurrency, setDisplayCurrency] = useState(bookingCurrency);
    // Depends on liveUserCurrency so the currency selector actually takes effect;
    // with [] the price stayed in whatever currency was active at mount until a
    // full page reload. Still does not re-run on a bare exchange-rate refresh, so
    // the figure doesn't drift on its own.
    useEffect(() => {
        setDisplayPrice(Math.round(convertCurrency(booking.total_price, bookingCurrency, liveUserCurrency)));
        setDisplayCurrency(liveUserCurrency);
    }, [liveUserCurrency]); // eslint-disable-line react-hooks/exhaustive-deps

    const checkInDate = new Date(booking.check_in);
    const checkOutDate = new Date(booking.check_out);
    const nights = calculateNights(checkInDate, checkOutDate);

    const fmtDate = (date: Date) =>
        formatDate(date, { month: 'short', day: 'numeric', year: 'numeric' }, 'en-US');

    const normalizedStatus = booking.status?.toLowerCase() as typeof booking.status;
    const isUpcoming = checkInDate > new Date();
    const isPast = checkOutDate < new Date();

    const policyType = (booking.policy_type || 'non_refundable') as BookingPolicyType;

    const rating = (booking as any).rating ?? 0;

    return (
        <>
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.1 }}
                transition={{ delay: index * 0.03, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                className="bg-white dark:bg-slate-900 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all group cursor-default"
            >
                {/* ── MOBILE layout: compact horizontal list ── */}
                <div className="flex flex-row md:hidden min-h-[96px]">
                    {/* Image — smaller thumbnail */}
                    <div className="relative w-24 min-h-[96px] flex-shrink-0 overflow-hidden rounded-l-lg">
                        {booking.property_image ? (
                            <Image
                                src={booking.property_image}
                                alt={booking.property_name}
                                fill
                                sizes="96px"
                                className="object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                        ) : (
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                                <MapPin className="w-6 h-6 text-white/50" />
                            </div>
                        )}
                        {/* Status badge */}
                        <div className="absolute top-1 left-1">
                            <span className={`text-[clamp(0.5rem,1.5vw,0.5625rem)] font-semibold px-1.5 py-0.5 rounded shadow ${statusColors[normalizedStatus]}`}>
                                {statusLabels[normalizedStatus]}
                            </span>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 p-2.5 flex flex-col min-w-0">
                        <h3 className="text-[clamp(0.75rem,2vw,0.875rem)] font-bold text-slate-900 dark:text-white mb-0.5 leading-tight truncate">
                            {booking.property_name}
                        </h3>

                        <div className="text-[clamp(0.625rem,1.5vw,0.75rem)] text-slate-500 dark:text-slate-400 mb-1 truncate">
                            {fmtDate(checkInDate)} → {fmtDate(checkOutDate)} · {t(nights === 1 ? 'bookingCard.night' : 'bookingCard.nights', { count: nights })}
                        </div>

                        <div className="text-[clamp(0.625rem,1.5vw,0.75rem)] text-slate-500 dark:text-slate-400 mb-1">
                            {t(booking.guests_adults === 1 ? 'bookingCard.adult' : 'bookingCard.adults', { count: booking.guests_adults })}
                            {booking.guests_children > 0 && `, ${t(booking.guests_children === 1 ? 'bookingCard.child' : 'bookingCard.children', { count: booking.guests_children })}`}
                        </div>

                        {/* Policy badge (mobile) */}
                        {booking.cancellation_policy && (
                            <div className="mb-1.5">
                                {policyType === 'free_cancellation' ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                        <CheckCircle className="w-3 h-3 shrink-0" /> {t('bookingCard.policyBadges.freeCancellation')}
                                    </span>
                                ) : policyType === 'non_refundable' ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400 border border-red-200 dark:border-red-800">
                                        <Ban className="w-3 h-3 shrink-0" /> {t('bookingCard.policyBadges.nonRefundable')}
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                                        <RotateCcw className="w-3 h-3 shrink-0" /> {t('bookingCard.policyBadges.partialRefund')}
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Price + actions (mobile) */}
                        <div className="mt-auto flex items-center justify-between gap-2">
                            <span className="text-[clamp(0.875rem,2.5vw,1rem)] font-bold text-slate-900 dark:text-white">
                                {formatCurrency(displayPrice, displayCurrency)}
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowMapView(true); }}
                                    className="text-[10px] font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1"
                                >
                                    <Map className="w-3 h-3" /> {t('bookingCard.actions.map')}
                                </button>
                                <a
                                    href={`/trips/${booking.id}`}
                                    className="text-[10px] font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded px-1.5 py-0.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center gap-1"
                                >
                                    <ChevronRight className="w-3 h-3" /> {t('bookingCard.actions.details')}
                                </a>
                            {isUpcoming && normalizedStatus === 'confirmed' && (
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setShowModifyModal(true); }}
                                        className="text-[10px] font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded px-1.5 py-0.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                    >
                                        {t('bookingCard.actions.modify')}
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setShowCancelModal(true); }}
                                        className="text-[10px] font-medium text-red-500 dark:text-red-400 border border-red-200 dark:border-red-800 rounded px-1.5 py-0.5 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                    >
                                        {t('bookingCard.actions.cancel')}
                                    </button>
                                </div>
                            )}
                            {normalizedStatus === 'cancelled_refund_failed' && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowCancelModal(true); }}
                                    className="flex items-center gap-1 text-[10px] font-medium text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-700 rounded px-1.5 py-0.5 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors shrink-0"
                                >
                                    <AlertTriangle className="w-3 h-3" /> {t('bookingCard.actions.retryRefund')}
                                </button>
                            )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── DESKTOP layout ── */}
                <div className="hidden md:flex flex-row min-h-[212px]">
                    {/* The photograph runs the full height of the card and carries its left
                        corners — the design gives it a quarter of the row, not a thumbnail. */}
                    <div className="relative w-[242px] shrink-0 overflow-hidden rounded-l-lg">
                        {booking.property_image ? (
                            <Image
                                src={booking.property_image}
                                alt={booking.property_name}
                                fill
                                sizes="242px"
                                className="object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                        ) : (
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                                <MapPin className="w-8 h-8 text-white/50" />
                            </div>
                        )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 p-5 flex flex-col min-w-0 gap-2">
                        <h3 className="text-[15px] font-bold text-slate-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            {booking.property_name}
                        </h3>

                        {/* What the room is and what its rules are, as plain pills — the
                            design states them rather than colour-coding them. */}
                        <div className="flex flex-wrap items-center gap-2">
                            {booking.cancellation_policy && (
                                <span className="rounded-full bg-[#eff6ff] dark:bg-blue-900/30 px-3 py-1 text-[10px] text-slate-900 dark:text-slate-200">
                                    {policyType === 'free_cancellation'
                                        ? t('bookingCard.policyBadges.freeCancellation')
                                        : policyType === 'non_refundable'
                                            ? t('bookingCard.policyBadges.nonRefundable')
                                            : t('bookingCard.policyBadges.partialRefund')}
                                </span>
                            )}
                            {booking.room_name && (
                                <span className="rounded-full bg-[#eff6ff] dark:bg-blue-900/30 px-3 py-1 text-[10px] text-slate-900 dark:text-slate-200">
                                    {booking.room_name}
                                </span>
                            )}
                        </div>

                        <div className="mt-1 flex flex-col gap-1.5 text-[12px] text-slate-900 dark:text-slate-200">
                            <span className="flex items-center gap-2">
                                <CalendarCheck className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                                {t('bookingCard.stayDates', { from: fmtDate(checkInDate), to: fmtDate(checkOutDate) })}
                                <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">•</span>
                                {t(nights === 1 ? 'bookingCard.night' : 'bookingCard.nights', { count: nights })}
                            </span>
                            <span className="flex items-center gap-2">
                                <User className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                                {t(booking.guests_adults === 1 ? 'bookingCard.adult' : 'bookingCard.adults', { count: booking.guests_adults })}
                                {booking.guests_children > 0 && `, ${t(booking.guests_children === 1 ? 'bookingCard.child' : 'bookingCard.children', { count: booking.guests_children })}`}
                            </span>
                        </div>

                        {isPast && normalizedStatus === 'confirmed' && (
                            <span className="mt-auto text-[11px] text-slate-400">{t('bookingCard.tripCompleted')}</span>
                        )}
                        {normalizedStatus === 'cancelled' && (
                            <span className="mt-auto text-[11px] text-red-500 dark:text-red-400">{t('bookingCard.cancelled')}</span>
                        )}
                    </div>

                    {/* Right panel — status, price and the actions, behind one divider. */}
                    <div className="flex w-[200px] shrink-0 flex-col items-end gap-2 border-l border-slate-100 dark:border-slate-800 p-5">
                        <span className={`rounded-full px-3 py-0.5 text-[10px] whitespace-nowrap ${statusColors[normalizedStatus]}`}>
                            {statusLabels[normalizedStatus]}
                        </span>

                        <p className="text-[10px] font-bold text-[#939fb1] dark:text-slate-400">
                            {t('bookingCard.totalPaid')}{' '}
                            <span className="text-slate-900 dark:text-white">
                                {formatCurrency(displayPrice, displayCurrency)}
                            </span>
                        </p>

                        <a
                            href={`/trips/${booking.id}`}
                            className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                        >
                            {t('bookingCard.actions.details')}
                        </a>
                        <a
                            href={`/trips/invoice/${booking.id}?type=hotel`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                        >
                            <Download className="h-3.5 w-3.5 shrink-0" />
                            {t('bookingCard.actions.receipt')}
                        </a>

                        {/* The actions that change the booking keep their own weight; only
                            Map is the design's filled button. */}
                        <div className="mt-auto flex w-full flex-col gap-1.5">
                            {isUpcoming && normalizedStatus === 'confirmed' && (<>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowModifyModal(true); }}
                                    className="w-full flex items-center justify-center gap-1 text-[10px] font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg px-2 py-1.5 transition-colors"
                                >
                                    <Pencil className="w-3 h-3" />
                                    {t('bookingCard.actions.modify')}
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowCancelModal(true); }}
                                    className="w-full flex items-center justify-center gap-1 text-[10px] font-medium text-red-500 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg px-2 py-1.5 transition-colors"
                                >
                                    <XCircle className="w-3 h-3" />
                                    {t('bookingCard.actions.cancel')}
                                </button>
                            </>)}
                            {normalizedStatus === 'cancelled_refund_failed' && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowCancelModal(true); }}
                                    className="w-full flex items-center justify-center gap-1 text-[10px] font-medium text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg px-2 py-1.5 transition-colors"
                                >
                                    <AlertTriangle className="w-3 h-3" />
                                    {t('bookingCard.actions.retryRefund')}
                                </button>
                            )}
                            <button
                                onClick={(e) => { e.stopPropagation(); setShowMapView(true); }}
                                className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] text-white transition-colors hover:bg-blue-700"
                            >
                                <Map className="h-3 w-3" />
                                {t('bookingCard.actions.map')}
                            </button>
                        </div>
                    </div>
                </div>
            </motion.div>

        {/* Trip map full-screen view */}
        {showMapView && (
            <TripMapView booking={booking} onClose={() => setShowMapView(false)} />
        )}

        {/* Modals */}
        <ModificationModal
            booking={booking}
            isOpen={showModifyModal}
            onClose={() => setShowModifyModal(false)}
            onModified={() => {
                setShowModifyModal(false);
                onBookingUpdated?.();
            }}
        />

        <CancellationModal
            booking={booking}
            isOpen={showCancelModal}
            onClose={() => setShowCancelModal(false)}
            onCancelled={() => {
                setShowCancelModal(false);
                onBookingUpdated?.();
            }}
        />
        </>
    );
}
