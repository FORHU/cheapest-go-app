'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, LogIn, AlertTriangle } from 'lucide-react';
import { useCheckoutStore } from '@/stores/checkoutStore';
import { getCurrencySymbol } from '@/lib/currency';

interface SubmitBookingButtonProps {
    loading: boolean;
    prebooking: boolean;
    prebookId: string | null | undefined;
    priceReady: boolean;
    isAuthenticated: boolean;
    totalPrice: number;
    prebookError: string | null;
    onSubmit: () => void;
}

export function SubmitBookingButton({
    loading,
    prebooking,
    prebookId,
    priceReady,
    isAuthenticated,
    totalPrice,
    prebookError,
    onSubmit,
}: SubmitBookingButtonProps) {
    const t = useTranslations('checkout');
    const currency = useCheckoutStore((state) => state.selectedCurrency);
    const symbol = getCurrencySymbol(currency);
    const isPriceVerifying = !!prebookId && !priceReady && !prebookError;
    const isDisabled = loading || (prebooking && !prebookId) || isPriceVerifying || !!prebookError;

    const getButtonClasses = () => {
        if (loading) return 'bg-blue-500 text-white cursor-wait animate-pulse';
        if (prebooking && !prebookId) return 'bg-slate-300 text-slate-900 cursor-not-allowed';
        if (isPriceVerifying) return 'bg-slate-300 text-slate-900 cursor-not-allowed';
        if (prebookError) return 'bg-slate-300 text-slate-900 cursor-not-allowed';
        if (!isAuthenticated) return 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20';
        return 'bg-yellow-400 hover:bg-yellow-500 text-slate-900 shadow-yellow-400/20 cursor-pointer';
    };

    // Supplier-side hard failure — the hotel itself can't be booked right now.
    // Telling the user to "reselect the room" won't help; they need a different hotel.
    const isHotelUnavailable = !!prebookError && /try a different hotel|currently unavailable for booking/i.test(prebookError);
    // Session expiry — the token staled between search and checkout; retrying the same room works.
    const isSessionExpired = !!prebookError && !isHotelUnavailable && /no longer available|not available|sold out/i.test(prebookError);
    const isUnavailable = isHotelUnavailable || isSessionExpired;

    return (
        <>
            {/* Inline unavailability notice — visible right above the button on mobile */}
            {isHotelUnavailable && (
                <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-xs font-semibold text-red-700 dark:text-red-300">{t('submit.hotelUnavailable')}</p>
                        <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{t('submit.hotelUnavailableDesc')}</p>
                    </div>
                </div>
            )}
            {isSessionExpired && (
                <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-xs font-semibold text-red-700 dark:text-red-300">{t('submit.sessionExpired')}</p>
                        <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{t('submit.sessionExpiredDesc')}</p>
                    </div>
                </div>
            )}

            <button
                type="button"
                onClick={isUnavailable ? () => window.history.back() : onSubmit}
                disabled={loading || (prebooking && !prebookId) || isPriceVerifying || (!!prebookError && !isUnavailable)}
                className={`w-full py-2 lg:py-3 font-bold text-[12px] lg:text-base rounded-lg lg:rounded-xl shadow-lg transition-all flex items-center justify-center gap-1.5 lg:gap-3 ${
                    isUnavailable ? 'bg-red-600 hover:bg-red-700 text-white cursor-pointer' : getButtonClasses()
                }`}
            >
                {loading ? (
                    <>
                        <Loader2 className="w-4 h-4 lg:w-5 lg:h-5 animate-spin" />
                        <span>{t('submit.processingBooking')}</span>
                    </>
                ) : (prebooking && !prebookId) ? (
                    <>
                        <Loader2 className="w-4 h-4 lg:w-5 lg:h-5 animate-spin" />
                        <span>{t('submit.verifyingRoom')}</span>
                    </>
                ) : isPriceVerifying ? (
                    <>
                        <Loader2 className="w-4 h-4 lg:w-5 lg:h-5 animate-spin" />
                        <span>{t('submit.verifyingPrice')}</span>
                    </>
                ) : isHotelUnavailable ? (
                    <span>{t('submit.goBackDifferentHotel')}</span>
                ) : isSessionExpired ? (
                    <span>{t('submit.goBackReselect')}</span>
                ) : prebookError ? (
                    <span>{t('submit.verificationFailed')}</span>
                ) : !isAuthenticated ? (
                    <>
                        <LogIn className="w-4 h-4 lg:w-5 lg:h-5" />
                        <span>{t('submit.signInToComplete')}</span>
                    </>
                ) : (
                    t('submit.continueToPayment', { amount: `${symbol}${(totalPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` })
                )}
            </button>

            {/* Loading overlay message */}
            {loading && (
                <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg text-center">
                    <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                        {t('submit.waitingMessage')}
                    </p>
                    <p className="text-xs text-blue-500 dark:text-blue-400 mt-1">
                        {t('submit.waitingWarning')}
                    </p>
                </div>
            )}
        </>
    );
}
