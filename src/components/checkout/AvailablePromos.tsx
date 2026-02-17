'use client';

import React, { useCallback, useEffect } from 'react';
import { Sparkles, Clock, Loader2, Tag, Percent, BadgeDollarSign } from 'lucide-react';
import { useVoucherState, useVoucherActions } from '@/stores/checkoutStore';
import { apiFetch } from '@/lib/api/client';
import type { AvailablePromo, VoucherValidationSuccess } from '@/types/voucher';

interface AvailablePromosProps {
    bookingPrice: number;
    currency: string;
    hotelId?: string;
    locationCode?: string;
    /** Callback to re-prebook with voucher code */
    onVoucherApplied?: (voucherCode: string) => Promise<any>;
}

function formatExpiry(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

function getCategoryLabel(category: string): string {
    switch (category) {
        case 'first_time': return 'New User';
        case 'location_based': return 'Location';
        case 'hotel_specific': return 'Hotel Deal';
        case 'seasonal': return 'Seasonal';
        default: return 'Promo';
    }
}

function getCategoryColor(category: string): string {
    switch (category) {
        case 'first_time': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
        case 'location_based': return 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300';
        case 'hotel_specific': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
        case 'seasonal': return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';
        default: return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    }
}

export function AvailablePromos({
    bookingPrice,
    currency,
    hotelId,
    locationCode,
    onVoucherApplied,
}: AvailablePromosProps) {
    const {
        availablePromos,
        promosLoading,
        appliedVoucher,
        voucherLoading,
    } = useVoucherState();

    const {
        setAvailablePromos,
        setPromosLoading,
        setVoucherCode,
        setAppliedVoucher,
        setVoucherLoading,
        setVoucherError,
    } = useVoucherActions();

    // Fetch available promos from server on mount/price change
    useEffect(() => {
        if (bookingPrice <= 0) return;

        let cancelled = false;

        const fetchPromos = async () => {
            setPromosLoading(true);
            try {
                const result = await apiFetch('/api/voucher/list', {
                    bookingPrice,
                    currency,
                    hotelId,
                    locationCode,
                });

                if (!cancelled && result.success && result.data) {
                    setAvailablePromos(result.data);
                }
            } catch {
                // Silently fail — promos are optional
            } finally {
                if (!cancelled) setPromosLoading(false);
            }
        };

        fetchPromos();

        return () => { cancelled = true; };
    }, [bookingPrice, currency, hotelId, locationCode, setAvailablePromos, setPromosLoading]);

    // Apply a promo from the available list (server-validated)
    const handleApplyPromo = useCallback(async (promo: AvailablePromo) => {
        if (voucherLoading) return;

        setVoucherLoading(true);
        setVoucherError(null);
        setVoucherCode(promo.code);

        try {
            const result = await apiFetch('/api/voucher/validate', {
                code: promo.code,
                bookingPrice,
                currency,
                hotelId,
                locationCode,
            });

            if (!result.success) {
                setVoucherError(result.error);
                return;
            }

            if (!result.data.valid) {
                setVoucherError(result.data.message);
                return;
            }

            const validData = result.data as VoucherValidationSuccess;
            setAppliedVoucher({
                code: validData.promo.code,
                discountType: validData.promo.type,
                discountValue: validData.promo.value,
                discountAmount: validData.discountAmount,
                finalPrice: validData.finalPrice,
                description: validData.promo.description,
            });

            // Re-prebook with voucher code to apply discount at LiteAPI level
            if (onVoucherApplied) {
                try {
                    await onVoucherApplied(validData.promo.code);
                } catch (err) {
                    console.error('Re-prebook with voucher failed:', err);
                }
            }
        } catch {
            setVoucherError('Failed to apply promo. Please try again.');
        } finally {
            setVoucherLoading(false);
        }
    }, [voucherLoading, bookingPrice, currency, hotelId, locationCode, setVoucherLoading, setVoucherError, setVoucherCode, setAppliedVoucher, onVoucherApplied]);

    // Don't render if loading or no promos
    if (promosLoading) {
        return (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                    <Sparkles size={16} className="text-amber-500" />
                    <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
                        Available promos
                    </h3>
                </div>
                <div className="flex items-center justify-center py-4 text-slate-400">
                    <Loader2 size={20} className="animate-spin" />
                    <span className="ml-2 text-sm">Loading available promos...</span>
                </div>
            </div>
        );
    }

    if (availablePromos.length === 0) return null;

    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
                <Sparkles size={16} className="text-amber-500" />
                <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
                    Available promos for this booking
                </h3>
            </div>

            <div className="space-y-2.5">
                {availablePromos.map((promo) => {
                    const isApplied = appliedVoucher?.code === promo.code;

                    return (
                        <div
                            key={promo.code}
                            className={`relative flex items-center justify-between p-3 rounded-lg border transition-all
                                ${isApplied
                                    ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-900/10'
                                    : 'border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-slate-800/50 hover:border-blue-200 dark:hover:border-blue-800'
                                }`}
                        >
                            {/* Left: promo details */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    {/* Discount icon */}
                                    {promo.discountType === 'percentage' ? (
                                        <Percent size={14} className="text-blue-500 flex-shrink-0" />
                                    ) : (
                                        <BadgeDollarSign size={14} className="text-blue-500 flex-shrink-0" />
                                    )}

                                    {/* Code badge */}
                                    <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-200 tracking-wider bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">
                                        {promo.code}
                                    </span>

                                    {/* Category tag */}
                                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${getCategoryColor(promo.category)}`}>
                                        {getCategoryLabel(promo.category)}
                                    </span>
                                </div>

                                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-1">
                                    {promo.description}
                                </p>

                                {/* Conditions */}
                                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                    {promo.discountType === 'percentage' ? (
                                        <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                                            {promo.discountValue}% off
                                        </span>
                                    ) : (
                                        <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                                            ₱{promo.discountValue.toLocaleString()} off
                                        </span>
                                    )}

                                    {promo.minBookingAmount && (
                                        <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                            Min. ₱{promo.minBookingAmount.toLocaleString()}
                                        </span>
                                    )}

                                    {promo.maxDiscountAmount && (
                                        <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                            Up to ₱{promo.maxDiscountAmount.toLocaleString()}
                                        </span>
                                    )}

                                    <span className="flex items-center gap-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                                        <Clock size={10} />
                                        Until {formatExpiry(promo.validUntil)}
                                    </span>
                                </div>
                            </div>

                            {/* Right: Apply button */}
                            <div className="ml-3 flex-shrink-0">
                                {isApplied ? (
                                    <span className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                                        <Tag size={12} />
                                        Applied
                                    </span>
                                ) : (
                                    <button
                                        onClick={() => handleApplyPromo(promo)}
                                        disabled={voucherLoading}
                                        className="px-3 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400
                                            bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40
                                            border border-blue-200 dark:border-blue-800
                                            rounded-lg transition-all active:scale-95
                                            disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {voucherLoading ? (
                                            <Loader2 size={12} className="animate-spin" />
                                        ) : (
                                            'Apply'
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
