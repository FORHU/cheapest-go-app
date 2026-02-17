'use client';

import React from 'react';
import { Calendar, Star, MapPin, Tag } from 'lucide-react';
import { CancellationPolicySection } from './CancellationPolicySection';
import { CancellationPolicy } from '@/services/booking.service';
import type { AppliedVoucher } from '@/types/voucher';

interface BookingSummaryProps {
    propertyName: string;
    propertyImage?: string;
    propertyAddress?: string;
    starRating?: number;
    reviewScore?: number;
    reviewCount?: number;
    roomTitle: string;
    roomPrice: number;
    totalNights: number;
    adults: number;
    children: number;
    taxes: number;
    totalPrice: number;
    checkIn?: Date | null;
    checkOut?: Date | null;
    prebookId: string | null | undefined;
    cancellationPolicies?: CancellationPolicy;
    /** Server-validated applied voucher (display only) */
    appliedVoucher?: AppliedVoucher | null;
}

function formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

function getRatingLabel(score: number): string {
    if (score >= 9) return 'Exceptional';
    if (score >= 8) return 'Fabulous';
    if (score >= 7) return 'Very Good';
    if (score >= 6) return 'Good';
    if (score >= 5) return 'Average';
    return 'Pleasant';
}

export function BookingSummary({
    propertyName,
    propertyImage,
    propertyAddress,
    starRating,
    reviewScore,
    reviewCount,
    roomTitle,
    roomPrice,
    totalNights,
    adults,
    children,
    taxes,
    totalPrice,
    checkIn,
    checkOut,
    prebookId,
    cancellationPolicies,
    appliedVoucher,
}: BookingSummaryProps) {
    const perNightPrice = totalNights > 0 ? Math.round(roomPrice / totalNights) : roomPrice;

    return (
        <div className="lg:col-span-1">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-white/10 shadow-lg sticky top-24 overflow-hidden">

                {/* Hotel Card Header */}
                <div className="p-5 flex gap-4">
                    {propertyImage && (
                        <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
                            <img
                                src={propertyImage}
                                alt={propertyName}
                                className="w-full h-full object-cover"
                            />
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        {/* Star rating */}
                        {starRating && starRating > 0 && (
                            <div className="flex items-center gap-0.5 mb-1">
                                {Array.from({ length: Math.round(starRating) }).map((_, i) => (
                                    <Star key={i} size={12} className="fill-amber-400 text-amber-400" />
                                ))}
                            </div>
                        )}
                        <h3 className="font-bold text-slate-900 dark:text-white text-sm leading-tight truncate">
                            {propertyName}
                        </h3>
                        {propertyAddress && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1 truncate">
                                <MapPin size={10} className="flex-shrink-0" />
                                {propertyAddress}
                            </p>
                        )}
                        {/* Review badge */}
                        {reviewScore && reviewScore > 0 && (
                            <div className="flex items-center gap-1.5 mt-1.5">
                                <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                                    {reviewScore.toFixed(1)}
                                </span>
                                <span className="text-xs text-slate-600 dark:text-slate-400">
                                    {getRatingLabel(reviewScore)}
                                    {reviewCount ? ` (${reviewCount})` : ''}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="px-5 pb-5 space-y-4">
                    {/* Check-in & Check-out */}
                    {checkIn && checkOut && (
                        <div className="border-t border-dashed border-slate-200 dark:border-white/10 pt-4">
                            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
                                <Calendar size={12} />
                                <span>Check-in & Check-out</span>
                            </div>
                            <div className="text-sm font-medium text-slate-900 dark:text-white">
                                {formatDate(checkIn)} – {formatDate(checkOut)}
                                <span className="text-slate-500 dark:text-slate-400 font-normal ml-1">
                                    ({totalNights} {totalNights === 1 ? 'night' : 'nights'})
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Cancellation Policy */}
                    {cancellationPolicies?.cancelPolicyInfos?.length ? (
                        <div className="border-t border-dashed border-slate-200 dark:border-white/10 pt-4">
                            <CancellationPolicySection
                                cancellationPolicies={cancellationPolicies}
                                totalPrice={totalPrice}
                            />
                        </div>
                    ) : null}

                    {/* Your Room */}
                    <div className="border-t border-dashed border-slate-200 dark:border-white/10 pt-4">
                        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Your Room</div>
                        <div className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                            {roomTitle}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                            {adults} {adults === 1 ? 'Adult' : 'Adults'}{children > 0 ? ` + ${children} ${children === 1 ? 'Child' : 'Children'}` : ''}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            ₱{perNightPrice.toLocaleString()} average per night
                        </div>
                        {prebookId && (
                            <span className="inline-block mt-2 text-emerald-600 dark:text-emerald-400 font-bold text-xs bg-emerald-100 dark:bg-emerald-900/30 px-2 py-1 rounded">
                                Room Confirmed
                            </span>
                        )}
                    </div>

                    {/* Price Breakdown — all values from server */}
                    <div className="border-t border-dashed border-slate-200 dark:border-white/10 pt-4 space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-600 dark:text-slate-400">
                                1 room × {totalNights} {totalNights === 1 ? 'night' : 'nights'}
                            </span>
                            <span className="font-medium text-slate-900 dark:text-white">
                                ₱{roomPrice.toLocaleString()}
                            </span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-600 dark:text-slate-400">Included taxes and fees</span>
                            <span className="font-medium text-slate-900 dark:text-white">₱{taxes.toLocaleString()}</span>
                        </div>

                        {/* Voucher discount line (server-calculated amount) */}
                        {appliedVoucher && (
                            <div className="flex justify-between text-sm items-center">
                                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                                    <Tag size={12} className="flex-shrink-0" />
                                    <span>Promo: {appliedVoucher.code}</span>
                                </span>
                                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                    -₱{appliedVoucher.discountAmount.toLocaleString()}
                                </span>
                            </div>
                        )}

                        {/* Total — uses server-calculated final price when voucher applied */}
                        <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-200 dark:border-white/10">
                            <span className="text-slate-900 dark:text-white">Total</span>
                            <div className="text-right">
                                {appliedVoucher ? (
                                    <>
                                        <span className="text-sm line-through text-slate-400 dark:text-slate-500 mr-2 font-normal">
                                            ₱{(totalPrice || 0).toLocaleString()}
                                        </span>
                                        <span className="text-emerald-600 dark:text-emerald-400">
                                            ₱{appliedVoucher.finalPrice.toLocaleString()}
                                        </span>
                                    </>
                                ) : (
                                    <span className="text-slate-900 dark:text-white">
                                        ₱{(totalPrice || 0).toLocaleString()}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Savings highlight */}
                        {appliedVoucher && (
                            <div className="text-center pt-1">
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1 rounded-full">
                                    You save ₱{appliedVoucher.discountAmount.toLocaleString()} with this promo
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
