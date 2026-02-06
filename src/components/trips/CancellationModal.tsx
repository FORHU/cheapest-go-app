"use client";

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, Check, Loader2 } from 'lucide-react';
import type { BookingRecord } from '@/lib/server/bookings';
import { formatCurrency } from '@/lib/utils';
import { calculateCancellationFee } from '@/lib/cancellation';
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

    // Calculate fee using shared helper
    const feeResult = useMemo(
        () => calculateCancellationFee(cancellationPolicies, booking.total_price, booking.currency),
        [cancellationPolicies, booking.total_price, booking.currency]
    );

    const isFreeCancellation = feeResult ? feeResult.fee === 0 : cancellationPolicies?.refundableTag === 'RFN';

    const handleCancel = async () => {
        await cancelMutation.mutateAsync(booking.booking_id);
        onCancelled();
        onClose();
    };

    if (!isOpen) return null;

    const showContent = !isLoading || hasCachedPolicy;
    const error = detailsError?.message || null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    transition={{ duration: 0.2 }}
                    className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-white/10">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
                                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                            </div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                                Cancel Booking
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
                    <div className="p-5 overflow-y-auto max-h-[60vh]">
                        {!showContent ? (
                            <div className="flex flex-col items-center justify-center py-12">
                                <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-3" />
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    Loading cancellation policy...
                                </p>
                            </div>
                        ) : error && !hasCachedPolicy ? (
                            <div className="text-center py-8">
                                <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
                                <p className="text-slate-900 dark:text-white font-medium mb-2">
                                    Unable to load policy
                                </p>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                                    {error}
                                </p>
                                <button
                                    onClick={() => refetch()}
                                    className="text-blue-600 dark:text-blue-400 text-sm font-medium hover:underline"
                                >
                                    Try again
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
                                            Booking ID: {booking.booking_id}
                                        </span>
                                        <span className="font-semibold text-slate-900 dark:text-white">
                                            {formatCurrency(booking.total_price, booking.currency)}
                                        </span>
                                    </div>
                                </div>

                                {/* Refundable Status */}
                                <div className={`flex items-center gap-2 p-3 rounded-lg mb-5 ${
                                    isFreeCancellation
                                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                                        : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                                }`}>
                                    {isFreeCancellation ? (
                                        <Check className="w-5 h-5" />
                                    ) : (
                                        <AlertTriangle className="w-5 h-5" />
                                    )}
                                    <span className="font-medium text-sm">
                                        {isFreeCancellation
                                            ? 'Free cancellation — full refund if cancelled now'
                                            : 'This booking may not be fully refundable'}
                                    </span>
                                </div>

                                {/* Current Refund Amount */}
                                {feeResult && <CancellationFeeCard feeResult={feeResult} />}

                                {/* Cancellation Policies */}
                                <div className="mb-5">
                                    <h4 className="font-medium text-slate-900 dark:text-white mb-3">
                                        Cancellation Policy Timeline
                                    </h4>
                                    <CancellationPolicies
                                        policies={cancellationPolicies?.cancelPolicyInfos}
                                        hotelRemarks={cancellationPolicies?.hotelRemarks}
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center gap-3 p-5 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
                        <button
                            onClick={onClose}
                            disabled={cancelMutation.isPending}
                            className="flex-1 py-3 px-4 text-slate-700 dark:text-slate-300 font-medium rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
                        >
                            Keep Booking
                        </button>
                        <button
                            onClick={handleCancel}
                            disabled={isLoading || cancelMutation.isPending}
                            className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {cancelMutation.isPending ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Cancelling...
                                </>
                            ) : (
                                'Cancel Booking'
                            )}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
