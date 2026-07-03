"use client";

import React, { useState } from 'react';
import { Calendar, Star, MapPin, Tag, Pencil, Check, X, ChevronDown } from 'lucide-react';
import { CancellationPolicySection } from './CancellationPolicySection';
import { CancellationPolicy } from '@/services/booking.service';
import type { AppliedVoucher } from '@/types/voucher';
import { getCurrencySymbol } from '@/lib/currency';
import { useCheckoutStore } from '@/stores/checkoutStore';

interface Surcharge {
    chargeType: string;
    mandatory: boolean;
    amount: number;
}

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
    surcharges?: Surcharge[];
    totalPrice: number;
    checkIn?: Date | null;
    checkOut?: Date | null;
    prebookId: string | null | undefined;
    cancellationPolicies?: CancellationPolicy;
    /** Server-validated applied voucher (display only) */
    appliedVoucher?: AppliedVoucher | null;
    isLoading?: boolean;
    onDatesChange?: (checkIn: Date, checkOut: Date) => void;
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

function formatChargeType(chargeType: string): string {
    return chargeType
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, c => c.toUpperCase());
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
    surcharges,
    totalPrice,
    checkIn,
    checkOut,
    prebookId,
    cancellationPolicies,
    appliedVoucher,
    isLoading,
    onDatesChange,
}: BookingSummaryProps) {
    const currency = useCheckoutStore((state) => state.selectedCurrency);
    const symbol = getCurrencySymbol(currency);
    const perNightPrice = totalNights > 0 ? Math.round(roomPrice / totalNights) : roomPrice;

    const toInputValue = (d: Date | null | undefined) =>
        d ? d.toISOString().slice(0, 10) : '';

    const [editingDates, setEditingDates] = useState(false);
    const [draftCheckIn, setDraftCheckIn] = useState('');
    const [draftCheckOut, setDraftCheckOut] = useState('');

    // Mobile-only: collapse the price line items to save vertical space.
    // The Total row stays visible regardless; desktop always shows the full breakdown.
    const [breakdownOpen, setBreakdownOpen] = useState(false);

    const today = new Date().toISOString().slice(0, 10);

    function openDateEditor() {
        setDraftCheckIn(toInputValue(checkIn));
        setDraftCheckOut(toInputValue(checkOut));
        setEditingDates(true);
    }

    function saveDates() {
        if (!draftCheckIn || !draftCheckOut || !onDatesChange) return;
        const ci = new Date(draftCheckIn);
        const co = new Date(draftCheckOut);
        if (isNaN(ci.getTime()) || isNaN(co.getTime()) || co <= ci) return;
        onDatesChange(ci, co);
        setEditingDates(false);
    }

    return (
        <div className="lg:col-span-1">
            <div className="bg-white dark:bg-slate-900 rounded-lg lg:rounded-xl border border-slate-200 dark:border-white/10 shadow-lg sticky top-24 overflow-hidden">

                {/* Hotel Card Header */}
                <div className="p-3 lg:p-5 flex gap-3 lg:gap-4">
                    {propertyImage && (
                        <div className="w-16 h-16 lg:w-20 lg:h-20 rounded-lg overflow-hidden flex-shrink-0">
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
                        <h3 className="font-bold text-slate-900 dark:text-white text-[13px] lg:text-sm leading-tight truncate">
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

                <div className="px-3 lg:px-5 pb-3 lg:pb-5 space-y-3 lg:space-y-4">
                    {/* Check-in & Check-out */}
                    {checkIn && checkOut && (
                        <div className="border-t border-dashed border-slate-200 dark:border-white/10 pt-3 lg:pt-4">
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-1.5 lg:gap-2 text-[10px] lg:text-xs text-slate-500 dark:text-slate-400">
                                    <Calendar size={12} className="lg:w-3.5 lg:h-3.5 w-3 h-3" />
                                    <span>Check-in & Check-out</span>
                                </div>
                                {onDatesChange && !editingDates && (
                                    <button
                                        onClick={openDateEditor}
                                        className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
                                    >
                                        <Pencil size={10} /> Edit
                                    </button>
                                )}
                            </div>

                            {editingDates ? (
                                <div className="space-y-2 mt-1">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">Check-in</p>
                                            <input
                                                type="date"
                                                value={draftCheckIn}
                                                min={today}
                                                onChange={e => setDraftCheckIn(e.target.value)}
                                                className="w-full text-[11px] border border-slate-300 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                            />
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">Check-out</p>
                                            <input
                                                type="date"
                                                value={draftCheckOut}
                                                min={draftCheckIn || today}
                                                onChange={e => setDraftCheckOut(e.target.value)}
                                                className="w-full text-[11px] border border-slate-300 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={saveDates}
                                            disabled={!draftCheckIn || !draftCheckOut || draftCheckOut <= draftCheckIn}
                                            className="flex-1 flex items-center justify-center gap-1 text-[11px] bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-3 py-1.5 rounded transition-colors"
                                        >
                                            <Check size={11} /> Update dates
                                        </button>
                                        <button
                                            onClick={() => setEditingDates(false)}
                                            className="flex items-center justify-center gap-1 text-[11px] border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 px-3 py-1.5 rounded hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                        >
                                            <X size={11} />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-[11px] lg:text-sm font-medium text-slate-900 dark:text-white">
                                    {formatDate(checkIn)} – {formatDate(checkOut)}
                                    <span className="text-slate-500 dark:text-slate-400 font-normal ml-1">
                                        ({totalNights} {totalNights === 1 ? 'night' : 'nights'})
                                    </span>
                                </div>
                            )}
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
                    <div className="border-t border-dashed border-slate-200 dark:border-white/10 pt-3 lg:pt-4">
                        <div className="text-[10px] lg:text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 lg:mb-2">Your Room</div>
                        <div className="text-[11px] lg:text-sm font-bold text-slate-900 dark:text-white mb-1">
                            {roomTitle}
                        </div>
                        <div className="text-[10px] lg:text-xs text-slate-500 dark:text-slate-400">
                            {adults} {adults === 1 ? 'Adult' : 'Adults'}{children > 0 ? ` + ${children} ${children === 1 ? 'Child' : 'Children'}` : ''}
                        </div>
                        <div className="text-[10px] lg:text-xs text-slate-500 dark:text-slate-400 mt-0.5 lg:mt-1">
                            {isLoading ? (
                                <span className="animate-pulse">Calculated per night...</span>
                            ) : (
                                <>{symbol}{perNightPrice.toLocaleString()} average per night</>
                            )}
                        </div>
                        {prebookId && (
                            <span className="inline-block mt-2 text-emerald-600 dark:text-emerald-400 font-bold text-xs bg-emerald-100 dark:bg-emerald-900/30 px-2 py-1 rounded">
                                Room Confirmed
                            </span>
                        )}
                    </div>

                    {/* Price Breakdown — all values from server */}
                    <div className="border-t border-dashed border-slate-200 dark:border-white/10 pt-3 lg:pt-4 space-y-1.5 lg:space-y-2">
                        {/* Mobile-only toggle — collapses the line items below. Hidden on desktop where the breakdown is always shown. */}
                        <button
                            type="button"
                            onClick={() => setBreakdownOpen((o) => !o)}
                            aria-expanded={breakdownOpen}
                            className="flex lg:hidden w-full items-center justify-between text-[11px] font-medium text-slate-600 dark:text-slate-400"
                        >
                            <span>Price details</span>
                            <ChevronDown
                                size={14}
                                className={`transition-transform duration-200 ${breakdownOpen ? 'rotate-180' : ''}`}
                            />
                        </button>

                        {/* Line items — collapsed on mobile unless expanded; always visible on desktop */}
                        <div className={`${breakdownOpen ? 'block' : 'hidden'} lg:block space-y-1.5 lg:space-y-2`}>
                            <div className="flex justify-between text-[11px] lg:text-sm">
                                <span className="text-slate-600 dark:text-slate-400">
                                    1 room × {totalNights} {totalNights === 1 ? 'night' : 'nights'}
                                </span>
                                <span className="font-medium text-slate-900 dark:text-white">
                                    {isLoading ? (
                                        <span className="h-4 w-16 bg-slate-100 dark:bg-slate-800 rounded animate-pulse inline-block" />
                                    ) : (
                                        <>{symbol}{roomPrice.toLocaleString()}</>
                                    )}
                                </span>
                            </div>
                            {surcharges && surcharges.length > 0 ? (
                                surcharges.map((s, i) => (
                                    <div key={i} className="flex justify-between text-[11px] lg:text-sm">
                                        <span className="text-slate-600 dark:text-slate-400">{formatChargeType(s.chargeType)}</span>
                                        <span className="font-medium text-slate-900 dark:text-white">
                                            {isLoading ? (
                                                <span className="h-4 w-12 bg-slate-100 dark:bg-slate-800 rounded animate-pulse inline-block" />
                                            ) : (
                                                <>{symbol}{s.amount.toLocaleString()}</>
                                            )}
                                        </span>
                                    </div>
                                ))
                            ) : (
                                <div className="flex justify-between text-[11px] lg:text-sm">
                                    <span className="text-slate-600 dark:text-slate-400">Taxes and fees</span>
                                    <span className="font-medium text-slate-900 dark:text-white">
                                        {isLoading ? (
                                            <span className="h-4 w-12 bg-slate-100 dark:bg-slate-800 rounded animate-pulse inline-block" />
                                        ) : (
                                            <>{symbol}{taxes.toLocaleString()}</>
                                        )}
                                    </span>
                                </div>
                            )}

                            {/* Voucher discount line (server-calculated amount) */}
                            {appliedVoucher && (
                                <div className="flex justify-between text-sm items-center">
                                    <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                                        <Tag size={12} className="flex-shrink-0" />
                                        <span>Promo: {appliedVoucher.code}</span>
                                    </span>
                                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                        -{symbol}{appliedVoucher.discountAmount.toLocaleString()}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Total — always visible (even when collapsed); uses server-calculated final price when voucher applied */}
                        <div className="flex justify-between text-[14px] lg:text-base font-bold pt-2 border-t border-slate-200 dark:border-white/10">
                            <span className="text-slate-900 dark:text-white">Total</span>
                            <div className="text-right">
                                {isLoading ? (
                                    <span className="h-5 w-20 bg-slate-100 dark:bg-slate-800 rounded animate-pulse inline-block" />
                                ) : appliedVoucher ? (
                                    <>
                                        <span className="text-[12px] line-through text-slate-400 dark:text-slate-500 mr-2 font-normal">
                                            {symbol}{(totalPrice || 0).toLocaleString()}
                                        </span>
                                        <span className="text-emerald-600 dark:text-emerald-400">
                                            {symbol}{appliedVoucher.finalPrice.toLocaleString()}
                                        </span>
                                    </>
                                ) : (
                                    <span className="text-slate-900 dark:text-white">
                                        {symbol}{(totalPrice || 0).toLocaleString()}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Savings highlight */}
                        {appliedVoucher && (
                            <div className="text-center pt-1">
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1 rounded-full">
                                    You save {symbol}{appliedVoucher.discountAmount.toLocaleString()} with this promo
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
