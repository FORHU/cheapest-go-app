"use client";

import React, { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MapPin, XCircle, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BookingRecord } from '@/services/booking.service';
import CancellationModal from './CancellationModal';
import ModificationModal from './ModificationModal';
import { statusColors, statusLabels } from '@/lib/constants';
import { formatDate, formatCurrency, calculateNights } from '@/lib/utils';
import { derivePolicyType, getPolicyTitle, getPolicyBadgeColor } from '@/lib/policy-formatter';
import { convertCurrency } from '@/lib/currency';
import { useUserCurrency } from '@/stores/searchStore';

interface BookingCardProps {
    booking: BookingRecord;
    onBookingUpdated?: () => void;
    index?: number;
}

function getRatingLabel(rating: number): string {
    if (rating >= 9) return 'Exceptional';
    if (rating >= 8) return 'Excellent';
    if (rating >= 7) return 'Very Good';
    if (rating >= 6) return 'Good';
    return 'Pleasant';
}

function getRatingColor(rating: number): string {
    if (rating >= 9) return 'bg-indigo-600';
    if (rating >= 8) return 'bg-emerald-500';
    if (rating >= 7) return 'bg-teal-500';
    if (rating >= 6) return 'bg-blue-500';
    return 'bg-amber-500';
}

export default function BookingCard({ booking, onBookingUpdated, index = 0 }: BookingCardProps) {
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [showModifyModal, setShowModifyModal] = useState(false);
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const userCurrency = useUserCurrency();
    const bookingCurrency = booking.currency || 'USD';
    const displayPrice = mounted
        ? Math.round(convertCurrency(booking.total_price, bookingCurrency, userCurrency))
        : booking.total_price;
    const displayCurrency = mounted ? userCurrency : bookingCurrency;

    const checkInDate = new Date(booking.check_in);
    const checkOutDate = new Date(booking.check_out);
    const nights = calculateNights(checkInDate, checkOutDate);

    const fmtDate = (date: Date) =>
        formatDate(date, { month: 'short', day: 'numeric', year: 'numeric' }, 'en-US');

    const normalizedStatus = booking.status?.toLowerCase() as typeof booking.status;
    const isUpcoming = checkInDate > new Date();
    const isPast = checkOutDate < new Date();

    const policyType = useMemo(
        () => derivePolicyType(
            booking.cancellation_policy?.refundableTag,
            booking.cancellation_policy?.cancelPolicyInfos
        ),
        [booking.cancellation_policy]
    );

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
                            <img
                                src={booking.property_image}
                                alt={booking.property_name}
                                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                        ) : (
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                                <MapPin className="w-6 h-6 text-white/50" />
                            </div>
                        )}
                        {/* Badges */}
                        <div className="absolute top-1 left-1 flex flex-col gap-1">
                            <span className={`text-[clamp(0.5rem,1.5vw,0.5625rem)] font-semibold px-1.5 py-0.5 rounded shadow ${statusColors[normalizedStatus]}`}>
                                {statusLabels[normalizedStatus]}
                            </span>
                            {isUpcoming && normalizedStatus === 'confirmed' && (
                                <span className={`text-[clamp(0.5rem,1.5vw,0.5625rem)] font-semibold text-white px-1.5 py-0.5 rounded shadow ${getPolicyBadgeColor(policyType)}`}>
                                    {getPolicyTitle(policyType)}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 p-2.5 flex flex-col min-w-0">
                        <h3 className="text-[clamp(0.75rem,2vw,0.875rem)] font-bold text-slate-900 dark:text-white mb-0.5 leading-tight truncate">
                            {booking.property_name}
                        </h3>

                        <div className="text-[clamp(0.625rem,1.5vw,0.75rem)] text-slate-500 dark:text-slate-400 mb-1 truncate">
                            {fmtDate(checkInDate)} → {fmtDate(checkOutDate)} · {nights} {nights === 1 ? 'night' : 'nights'}
                        </div>

                        <div className="text-[clamp(0.625rem,1.5vw,0.75rem)] text-slate-500 dark:text-slate-400 mb-1.5">
                            {booking.guests_adults} {booking.guests_adults === 1 ? 'adult' : 'adults'}
                            {booking.guests_children > 0 && `, ${booking.guests_children} ${booking.guests_children === 1 ? 'child' : 'children'}`}
                        </div>

                        {/* Price + actions (mobile) */}
                        <div className="mt-auto flex items-center justify-between gap-2">
                            <span className="text-[clamp(0.875rem,2.5vw,1rem)] font-bold text-slate-900 dark:text-white">
                                {formatCurrency(displayPrice, displayCurrency)}
                            </span>
                            {isUpcoming && normalizedStatus === 'confirmed' && (
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setShowModifyModal(true); }}
                                        className="text-[10px] font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded px-1.5 py-0.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                    >
                                        Modify
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setShowCancelModal(true); }}
                                        className="text-[10px] font-medium text-red-500 dark:text-red-400 border border-red-200 dark:border-red-800 rounded px-1.5 py-0.5 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── DESKTOP layout: compact horizontal list ── */}
                <div className="hidden md:flex flex-row min-h-[112px]">
                    {/* Image — smaller thumbnail */}
                    <div className="relative w-32 min-h-[112px] lg:w-36 lg:min-h-[112px] flex-shrink-0 overflow-hidden rounded-l-lg">
                        {booking.property_image ? (
                            <img
                                src={booking.property_image}
                                alt={booking.property_name}
                                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                        ) : (
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                                <MapPin className="w-8 h-8 text-white/50" />
                            </div>
                        )}
                        {/* Badges — stacked column so they never overlap */}
                        <div className="absolute top-1.5 left-1.5 flex flex-col gap-1">
                            <span className={`text-[clamp(0.5625rem,1.5vw,0.625rem)] font-semibold px-1.5 py-0.5 rounded shadow ${statusColors[normalizedStatus]}`}>
                                {statusLabels[normalizedStatus]}
                            </span>
                            {isUpcoming && normalizedStatus === 'confirmed' && (
                                <span className={`text-[clamp(0.5625rem,1.5vw,0.625rem)] font-semibold text-white px-1.5 py-0.5 rounded shadow ${getPolicyBadgeColor(policyType)}`}>
                                    {getPolicyTitle(policyType)}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 p-3 flex flex-col min-w-0">
                        <h3 className="text-[clamp(0.75rem,2vw,0.875rem)] font-bold text-slate-900 dark:text-white mb-0.5 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                            {booking.property_name}
                        </h3>

                        <div className="flex items-center text-[clamp(0.625rem,1.5vw,0.75rem)] text-blue-600 dark:text-blue-400 mb-0.5">
                            <MapPin size={12} className="mr-1 shrink-0" />
                            <span className="truncate">{booking.room_name}</span>
                        </div>

                        <div className="text-[clamp(0.625rem,1.5vw,0.75rem)] text-slate-500 dark:text-slate-400 mb-1">
                            {fmtDate(checkInDate)} → {fmtDate(checkOutDate)} · {nights} {nights === 1 ? 'night' : 'nights'}
                        </div>

                        {/* Guests */}
                        <div className="flex flex-wrap gap-1 mb-1.5">
                            <span className="inline-flex items-center px-1.5 py-0.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[clamp(0.5625rem,1.5vw,0.625rem)] text-slate-600 dark:text-slate-300">
                                {booking.guests_adults} {booking.guests_adults === 1 ? 'adult' : 'adults'}
                                {booking.guests_children > 0 && `, ${booking.guests_children} ${booking.guests_children === 1 ? 'child' : 'children'}`}
                            </span>
                        </div>

                        {isPast && normalizedStatus === 'confirmed' && (
                            <span className="mt-auto text-[clamp(0.5625rem,1.5vw,0.625rem)] text-slate-400">Trip completed</span>
                        )}
                        {normalizedStatus === 'cancelled' && (
                            <span className="mt-auto text-[clamp(0.5625rem,1.5vw,0.625rem)] text-red-500 dark:text-red-400">Cancelled</span>
                        )}
                    </div>

                    {/* Right panel — rating, price & actions */}
                    <div className="flex flex-col items-end justify-between w-[140px] lg:w-[160px] p-3 border-l border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 gap-2">
                        {/* Rating */}
                        {rating > 0 && (
                            <div className="flex items-center gap-1.5">
                                <span className={cn('text-[clamp(0.5625rem,1.5vw,0.625rem)] font-bold text-white px-1.5 py-0.5 rounded', getRatingColor(rating))}>
                                    {rating.toFixed(1)}
                                </span>
                                <div className="text-right">
                                    <div className="text-[clamp(0.625rem,1.5vw,0.75rem)] font-semibold text-slate-900 dark:text-white leading-none">
                                        {getRatingLabel(rating)}
                                    </div>
                                    {(booking as any).reviews != null && (booking as any).reviews > 0 && (
                                        <div className="text-[clamp(0.5625rem,1.5vw,0.625rem)] text-slate-500 dark:text-slate-400">
                                            {(booking as any).reviews.toLocaleString()} reviews
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Price */}
                        <div className="text-right">
                            <span className="text-[clamp(0.875rem,2.5vw,1rem)] font-bold text-slate-900 dark:text-white">
                                {formatCurrency(displayPrice, displayCurrency)}
                            </span>
                            <div className="text-[clamp(0.5625rem,1.5vw,0.625rem)] text-slate-500 dark:text-slate-400">total</div>
                        </div>

                        {/* Action buttons */}
                        {isUpcoming && normalizedStatus === 'confirmed' && (
                            <div className="flex flex-col gap-1.5 w-full">
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowModifyModal(true); }}
                                    className="w-full flex items-center justify-center gap-1 text-[10px] font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg px-2 py-1.5 transition-colors"
                                >
                                    <Pencil className="w-3 h-3" />
                                    Modify
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowCancelModal(true); }}
                                    className="w-full flex items-center justify-center gap-1 text-[10px] font-medium text-red-500 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg px-2 py-1.5 transition-colors"
                                >
                                    <XCircle className="w-3 h-3" />
                                    Cancel
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </motion.div>

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
