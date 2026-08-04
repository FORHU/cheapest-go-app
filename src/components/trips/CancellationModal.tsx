"use client";

import React, { useMemo, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { X, AlertTriangle, Check, Loader2 } from 'lucide-react';
import type { BookingRecord } from '@/services/booking.service';
import { formatCurrency } from '@/lib/utils';
import { convertCurrency } from '@/lib/currency';
import { useUserCurrency } from '@/stores/searchStore';
import { calculateCancellationFee, extractNoShowPenalty, extractEarlyDepartureFee } from '@/lib/cancellation';
import {
    getFreeCancelDeadline,
    getPolicyTitle,
    getPolicyBadgeColor,
    formatPolicyDescription,
} from '@/lib/policy-formatter';
import type { BookingPolicyType } from '@/types/booking-policy';
import { useBookingDetails, useCancelBooking } from '@/hooks/trips';
import { CancellationFeeCard } from './CancellationFeeCard';
import { CancellationPolicies } from './CancellationPolicies';

interface CancellationModalProps {
    booking: BookingRecord;
    isOpen: boolean;
    onClose: () => void;
    onCancelled: () => void;
}

export default function CancellationModal({ booking, isOpen, onClose, onCancelled }: CancellationModalProps) {
    const t = useTranslations('trips');
    const isRefundRetry = booking.status === 'cancelled_refund_failed';
    const userCurrency = useUserCurrency();
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    // React Query: fetch booking details (cached + background refresh)
    const {
        data: bookingDetails,
        isLoading,
        error: detailsError,
        refetch,
    } = useBookingDetails(booking.booking_id, isOpen);

    // React Query: cancel mutation
    const cancelMutation = useCancelBooking();

    // Use cached cancellation policy from booking if available
    const hasCachedPolicy = !!booking.cancellation_policy?.cancelPolicyInfos;

    // Merge: prefer fresh data from API, fall back to cached
    const cancellationPolicies = bookingDetails?.cancellationPolicies || booking.cancellation_policy;

    // Calculate fee in stored currency, then convert to user's display currency
    const feeResult = useMemo(() => {
        const raw = calculateCancellationFee(cancellationPolicies, booking.total_price, booking.currency);
        const displayCurrency = userCurrency || booking.currency;
        if (displayCurrency === booking.currency) return raw;
        return {
            ...raw,
            fee: convertCurrency(raw.fee, booking.currency, displayCurrency),
            refund: convertCurrency(raw.refund, booking.currency, displayCurrency),
            currency: displayCurrency,
        };
    }, [cancellationPolicies, booking.total_price, booking.currency, userCurrency]);

    // Use policy_type from DB directly — already correctly set at booking time.
    const policyType = (booking.policy_type || 'non_refundable') as BookingPolicyType;
    const freeDeadline = useMemo(
        () => getFreeCancelDeadline(cancellationPolicies?.cancelPolicyInfos, cancellationPolicies?.refundableTag),
        [cancellationPolicies]
    );

    const isFreeCancellation = policyType === 'free_cancellation';

    // Extract special fees from raw policy data
    const noShowPenalty = useMemo(
        () => extractNoShowPenalty(cancellationPolicies),
        [cancellationPolicies]
    );
    const earlyDepartureFee = useMemo(
        () => extractEarlyDepartureFee(cancellationPolicies),
        [cancellationPolicies]
    );

    const handleCancel = async () => {
        await cancelMutation.mutateAsync(booking.booking_id);
        onCancelled();
        onClose();
    };

    if (!isOpen) return null;

    const showContent = !isLoading || hasCachedPolicy;
    const error = detailsError?.message || null;

    const modalContent = (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col relative"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-white/10 shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
                                    <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                                </div>
                                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                                    {isRefundRetry ? t('cancellationModal.retryRefundTitle') : t('cancellationModal.title')}
                                </h2>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-5 overflow-y-auto flex-1">
                            {!showContent ? (
                                <div className="flex flex-col items-center justify-center py-12">
                                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-3" />
                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                        {t('cancellationModal.loadingPolicy')}
                                    </p>
                                </div>
                            ) : error && !hasCachedPolicy ? (
                                <div className="text-center py-8">
                                    <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
                                    <p className="text-slate-900 dark:text-white font-medium mb-2">
                                        {t('cancellationModal.unableToLoadPolicy')}
                                    </p>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                                        {error}
                                    </p>
                                    <button
                                        onClick={() => refetch()}
                                        className="text-blue-600 dark:text-blue-400 text-sm font-medium hover:underline"
                                    >
                                        {t('cancellationModal.tryAgain')}
                                    </button>
                                </div>
                            ) : (
                                <>
                                    {/* Booking Summary */}
                                    <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-4 mb-5">
                                        <h3 className="font-semibold text-slate-900 dark:text-white mb-2">
                                            {booking.property_name}
                                        </h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                                            {booking.room_name}
                                        </p>
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-slate-500 dark:text-slate-400">
                                                {t('cancellationModal.bookingId', { id: booking.booking_id })}
                                            </span>
                                            <span className="font-semibold text-slate-900 dark:text-white">
                                                {formatCurrency(
                                                    convertCurrency(booking.total_price, booking.currency, userCurrency || booking.currency),
                                                    userCurrency || booking.currency
                                                )}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Policy Badge + Description */}
                                    <div className="mb-5">
                                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${getPolicyBadgeColor(policyType)}`}>
                                            {isFreeCancellation ? (
                                                <Check className="w-3.5 h-3.5" />
                                            ) : (
                                                <AlertTriangle className="w-3.5 h-3.5" />
                                            )}
                                            {getPolicyTitle(policyType)}
                                        </span>
                                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                                            {formatPolicyDescription(policyType, freeDeadline)}
                                        </p>
                                    </div>

                                    {/* Current Refund Amount */}
                                    {feeResult && <CancellationFeeCard feeResult={feeResult} />}

                                    {/* Cancellation Policies */}
                                    <div className="mb-5">
                                        <h4 className="font-medium text-slate-900 dark:text-white mb-3">
                                            {t('cancellationModal.policyTimeline')}
                                        </h4>
                                        <CancellationPolicies
                                            policies={cancellationPolicies?.cancelPolicyInfos}
                                            hotelRemarks={cancellationPolicies?.hotelRemarks}
                                            noShowPenalty={noShowPenalty}
                                            earlyDepartureFee={earlyDepartureFee}
                                            currency={booking.currency}
                                        />
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="flex items-center gap-3 p-5 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 shrink-0">
                            <button
                                onClick={onClose}
                                disabled={cancelMutation.isPending}
                                className="flex-1 py-3 px-4 text-slate-700 dark:text-slate-300 font-medium rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
                            >
                                {isRefundRetry ? t('cancellationModal.close') : t('cancellationModal.keepBooking')}
                            </button>
                            <button
                                onClick={handleCancel}
                                disabled={isLoading || cancelMutation.isPending}
                                className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {cancelMutation.isPending ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        {isRefundRetry ? t('cancellationModal.retrying') : t('cancellationModal.cancelling')}
                                    </>
                                ) : (
                                    isRefundRetry ? t('cancellationModal.retryRefund') : t('cancellationModal.cancelBooking')
                                )}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    if (!mounted) return null;
    return createPortal(modalContent, document.body);
}
