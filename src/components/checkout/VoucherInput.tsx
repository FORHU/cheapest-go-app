'use client';

import React, { useCallback } from 'react';
import { Tag, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useVoucherState, useVoucherActions } from '@/stores/checkoutStore';
import { apiFetch } from '@/lib/api/client';
import type { VoucherValidationSuccess } from '@/types/voucher';

interface VoucherInputProps {
    bookingPrice: number;
    currency: string;
    hotelId?: string;
    locationCode?: string;
    /** Callback to re-prebook with voucher code (triggers new Payment SDK credentials) */
    onVoucherApplied?: (voucherCode: string) => Promise<any>;
    /** Callback to re-prebook without voucher (when voucher is removed) */
    onVoucherRemoved?: () => Promise<any>;
}

export function VoucherInput({
    bookingPrice,
    currency,
    hotelId,
    locationCode,
    onVoucherApplied,
    onVoucherRemoved,
}: VoucherInputProps) {
    const {
        voucherCode,
        appliedVoucher,
        voucherLoading,
        voucherError,
    } = useVoucherState();

    const {
        setVoucherCode,
        setAppliedVoucher,
        setVoucherLoading,
        setVoucherError,
        removeVoucher,
    } = useVoucherActions();

    const handleApply = useCallback(async () => {
        if (!voucherCode.trim() || voucherLoading) return;

        setVoucherLoading(true);
        setVoucherError(null);

        try {
            // API route → server utility → edge function
            // ALL validation and calculation happens server-side
            const result = await apiFetch('/api/voucher/validate', {
                code: voucherCode.trim(),
                bookingPrice,
                currency,
                hotelId,
                locationCode,
            });

            if (!result.success) {
                setVoucherError(result.error);
                return;
            }

            const data = result.data;

            if (!data.valid) {
                setVoucherError(data.message);
                return;
            }

            // Store server-calculated values (display only)
            const validData = data as VoucherValidationSuccess;
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
                    // Voucher is still shown in UI; discount applied locally
                }
            }
        } catch {
            setVoucherError('Failed to validate voucher. Please try again.');
        } finally {
            setVoucherLoading(false);
        }
    }, [voucherCode, voucherLoading, bookingPrice, currency, hotelId, locationCode, setVoucherLoading, setVoucherError, setAppliedVoucher, onVoucherApplied]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleApply();
        }
    }, [handleApply]);

    // Applied state — show badge
    if (appliedVoucher) {
        return (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm p-2.5 sm:p-5">
                <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-3">
                    <Tag size={14} className="text-blue-600 dark:text-blue-400 sm:w-4 sm:h-4" />
                    <h3 className="font-semibold text-slate-900 dark:text-white text-xs sm:text-sm">
                        Promo code
                    </h3>
                </div>

                {/* Applied badge */}
                <div className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-lg">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-emerald-700 dark:text-emerald-300 text-sm tracking-wide">
                                    {appliedVoucher.code}
                                </span>
                                <span className="text-xs bg-emerald-100 dark:bg-emerald-800 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded font-medium">
                                    {appliedVoucher.discountType === 'percentage'
                                        ? `${appliedVoucher.discountValue}% OFF`
                                        : `₱${appliedVoucher.discountValue.toLocaleString()} OFF`}
                                </span>
                            </div>
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                                {appliedVoucher.description}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            removeVoucher();
                            onVoucherRemoved?.().catch(() => { });
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors"
                        aria-label="Remove voucher"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Discount amount */}
                <div className="mt-2 text-right">
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        -₱{appliedVoucher.discountAmount.toLocaleString()} saved
                    </span>
                </div>
            </div>
        );
    }

    // Input state
    return (
        <div className="bg-white dark:bg-slate-900 rounded-lg sm:rounded-xl border border-slate-200 dark:border-white/10 shadow-sm p-2.5 sm:p-5">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-3">
                <Tag size={14} className="text-blue-600 dark:text-blue-400 sm:w-4 sm:h-4" />
                <h3 className="font-semibold text-slate-900 dark:text-white text-xs sm:text-sm">
                    Have a promo code?
                </h3>
            </div>

            <div className="flex gap-1.5">
                <div className="flex-1 relative min-w-0">
                    <input
                        type="text"
                        value={voucherCode}
                        onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                        onKeyDown={handleKeyDown}
                        placeholder="ENTER PROMO CODE"
                        disabled={voucherLoading}
                        className={`w-full px-2 py-1.5 sm:px-3 sm:py-2.5 text-[11px] sm:text-sm font-mono tracking-wider uppercase rounded sm:rounded-lg border transition-colors
                            ${voucherError
                                ? 'border-red-300 dark:border-red-700 focus:ring-red-500 focus:border-red-500'
                                : 'border-slate-200 dark:border-white/10 focus:ring-blue-500 focus:border-blue-500'
                            }
                            bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white
                            placeholder:text-slate-400 dark:placeholder:text-slate-500
                            disabled:opacity-50 disabled:cursor-not-allowed
                            focus:outline-none focus:ring-2`}
                    />
                </div>
                <button
                    onClick={handleApply}
                    disabled={!voucherCode.trim() || voucherLoading}
                    className="px-3 py-1.5 sm:px-5 sm:py-2.5 text-[11px] sm:text-sm font-semibold rounded sm:rounded-lg transition-all whitespace-nowrap
                        bg-blue-600 hover:bg-blue-700 text-white
                        disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed
                        dark:disabled:bg-slate-700 dark:disabled:text-slate-500
                        active:scale-[0.98]"
                >
                    {voucherLoading ? (
                        <Loader2 size={16} className="animate-spin" />
                    ) : (
                        'Apply'
                    )}
                </button>
            </div>

            {/* Error message */}
            {voucherError && (
                <div className="flex items-center gap-1.5 mt-2 text-red-600 dark:text-red-400">
                    <AlertCircle size={14} className="flex-shrink-0" />
                    <span className="text-xs">{voucherError}</span>
                </div>
            )}
        </div>
    );
}
