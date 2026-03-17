'use client';

import React from 'react';
import { Loader2, LogIn } from 'lucide-react';
import { useUserCurrency } from '@/stores/searchStore';
import { getCurrencySymbol } from '@/lib/currency';

interface SubmitBookingButtonProps {
    loading: boolean;
    prebooking: boolean;
    prebookId: string | null | undefined;
    isAuthenticated: boolean;
    totalPrice: number;
    prebookError: string | null;
    onSubmit: () => void;
}

export function SubmitBookingButton({
    loading,
    prebooking,
    prebookId,
    isAuthenticated,
    totalPrice,
    prebookError,
    onSubmit,
}: SubmitBookingButtonProps) {
    const currency = useUserCurrency();
    const symbol = getCurrencySymbol(currency);
    const isDisabled = loading || (prebooking && !prebookId) || !!prebookError;

    const getButtonClasses = () => {
        if (loading) return 'bg-blue-500 text-white cursor-wait animate-pulse';
        if (prebooking && !prebookId) return 'bg-slate-300 text-slate-900 cursor-not-allowed';
        if (prebookError) return 'bg-slate-300 text-slate-900 cursor-not-allowed';
        if (!isAuthenticated) return 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20';
        return 'bg-yellow-400 hover:bg-yellow-500 text-slate-900 shadow-yellow-400/20 cursor-pointer';
    };

    return (
        <>
            <button
                type="button"
                onClick={onSubmit}
                disabled={isDisabled}
                className={`w-full py-2 lg:py-3 font-bold text-[12px] lg:text-base rounded-lg lg:rounded-xl shadow-lg transition-all flex items-center justify-center gap-1.5 lg:gap-3 ${getButtonClasses()}`}
            >
                {loading ? (
                    <>
                        <Loader2 className="w-4 h-4 lg:w-5 lg:h-5 animate-spin" />
                        <span>Processing Your Booking...</span>
                    </>
                ) : (prebooking && !prebookId) ? (
                    <>
                        <Loader2 className="w-4 h-4 lg:w-5 lg:h-5 animate-spin" />
                        <span>Verifying Room...</span>
                    </>
                ) : prebookError ? (
                    <span className="text-[12px] lg:text-base">Room verification failed — please retry above</span>
                ) : !isAuthenticated ? (
                    <>
                        <LogIn className="w-4 h-4 lg:w-5 lg:h-5" />
                        <span>Sign In to Complete Booking</span>
                    </>
                ) : (
                    `Continue to Payment • ${symbol}${(totalPrice || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                )}
            </button>

            {/* Loading overlay message */}
            {loading && (
                <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg text-center">
                    <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                        Please wait while we confirm your reservation with the hotel...
                    </p>
                    <p className="text-xs text-blue-500 dark:text-blue-400 mt-1">
                        This may take up to 30 seconds. Do not close this page.
                    </p>
                </div>
            )}
        </>
    );
}
