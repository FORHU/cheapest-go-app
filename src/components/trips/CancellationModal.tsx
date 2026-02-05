"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, Check, Loader2, Calendar, DollarSign, Info } from 'lucide-react';
import { bookingService, type BookingRecord, type BookingDetailsResponse, type CancelPolicyInfo } from '@/services/booking.service';
import { toast } from 'sonner';

interface CancellationModalProps {
    booking: BookingRecord;
    isOpen: boolean;
    onClose: () => void;
    onCancelled: () => void;
}

export default function CancellationModal({ booking, isOpen, onClose, onCancelled }: CancellationModalProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const [bookingDetails, setBookingDetails] = useState<BookingDetailsResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Use cached cancellation policy from booking if available, fetch fresh data in background
    const hasCachedPolicy = !!booking.cancellation_policy?.cancelPolicyInfos;

    const fetchBookingDetails = useCallback(async () => {
        // Only show loading if we don't have cached data
        if (!hasCachedPolicy) {
            setIsLoading(true);
        }
        setError(null);

        try {
            const details = await bookingService.getBookingDetails(booking.booking_id);
            setBookingDetails(details);
        } catch (err: any) {
            console.error('Failed to fetch booking details:', err);
            // Only set error if we don't have cached data
            if (!hasCachedPolicy) {
                setError(err.message || 'Failed to fetch cancellation policy');
            }
        } finally {
            setIsLoading(false);
        }
    }, [booking.booking_id, hasCachedPolicy]);

    useEffect(() => {
        if (isOpen && booking) {
            fetchBookingDetails();
        }
    }, [isOpen, booking, fetchBookingDetails]);

    // Parallelize cancel API call and database update for faster completion
    const handleCancel = useCallback(async () => {
        setIsCancelling(true);
        try {
            // Run cancel and update in parallel for faster completion
            const [result] = await Promise.all([
                bookingService.cancelBooking(booking.booking_id),
                bookingService.updateBookingStatus(booking.booking_id, 'cancelled')
            ]);

            toast.success('Booking cancelled successfully', {
                description: result.refund
                    ? `Refund of ${result.refund.currency} ${result.refund.amount.toFixed(2)} will be processed`
                    : 'Your booking has been cancelled'
            });

            onCancelled();
            onClose();
        } catch (err: any) {
            console.error('Cancellation failed:', err);
            toast.error('Cancellation failed', {
                description: err.message || 'Please try again or contact support'
            });
        } finally {
            setIsCancelling(false);
        }
    }, [booking.booking_id, onCancelled, onClose]);

    const formatDate = useCallback((dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }, []);

    const formatPrice = useCallback((amount: number, currency: string) => {
        return new Intl.NumberFormat('en-PH', {
            style: 'currency',
            currency: currency || 'PHP',
        }).format(amount);
    }, []);

    // Get cancellation policies from fetched details or cached booking data
    const cancellationPolicies = useMemo(() => {
        return bookingDetails?.cancellationPolicies || booking.cancellation_policy;
    }, [bookingDetails?.cancellationPolicies, booking.cancellation_policy]);

    const isRefundable = useMemo(() => {
        return cancellationPolicies?.refundableTag === 'RFN';
    }, [cancellationPolicies?.refundableTag]);

    // Memoize the cancellation fee calculation
    const currentCancellationFee = useMemo((): { fee: number; refund: number; currency: string } | null => {
        const policies = cancellationPolicies?.cancelPolicyInfos;
        if (!policies || policies.length === 0) return null;

        const now = new Date();
        const totalPrice = booking.total_price;
        const currency = booking.currency;
        const rfn = cancellationPolicies?.refundableTag === 'RFN';

        // Sort policies by cancelTime ascending
        const sortedPolicies = [...policies].sort(
            (a, b) => new Date(a.cancelTime).getTime() - new Date(b.cancelTime).getTime()
        );

        // Find the current applicable fee by finding which time window we're in.
        // Each entry defines a window: cancel before this cancelTime → this fee.
        // Past all deadlines → full charge.
        let applicableFee = totalPrice; // default: past all deadlines
        for (const policy of sortedPolicies) {
            if (now < new Date(policy.cancelTime)) {
                applicableFee = policy.type === 'PERCENT'
                    ? (totalPrice * policy.amount) / 100
                    : policy.amount;
                break; // found our window
            }
        }

        // Handle RFN bookings where the API omits the amount=0 "free period" entry.
        // If booking is RFN, there are no explicit amount=0 entries, and we're
        // before the first deadline → we're in the implied free cancellation window.
        const hasExplicitFreeEntry = sortedPolicies.some(p => p.amount === 0);
        if (rfn && !hasExplicitFreeEntry && applicableFee > 0) {
            const firstDeadline = new Date(sortedPolicies[0].cancelTime);
            if (now < firstDeadline) {
                applicableFee = 0;
            }
        }

        return {
            fee: applicableFee,
            refund: totalPrice - applicableFee,
            currency
        };
    }, [cancellationPolicies, booking.total_price, booking.currency]);

    // Determine if currently free to cancel based on actual fee calculation
    // This is more accurate than refundableTag alone
    const isCurrentlyFreeCancellation = useMemo(() => {
        if (currentCancellationFee) {
            return currentCancellationFee.fee === 0;
        }
        return isRefundable;
    }, [currentCancellationFee, isRefundable]);

    const renderCancellationPolicies = useCallback(() => {
        const policies = cancellationPolicies?.cancelPolicyInfos;
        if (!policies || policies.length === 0) {
            return (
                <div className="text-sm text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-white/5 p-4 rounded-lg">
                    <Info className="inline-block w-4 h-4 mr-2" />
                    No specific cancellation policy available. Standard terms apply.
                </div>
            );
        }

        return (
            <div className="space-y-3">
                {policies.map((policy: CancelPolicyInfo, index: number) => {
                    const policyTime = new Date(policy.cancelTime);
                    const isPast = policyTime < new Date();
                    const feeAmount = policy.type === 'PERCENT'
                        ? `${policy.amount}%`
                        : formatPrice(policy.amount, policy.currency);

                    return (
                        <div
                            key={index}
                            className={`flex items-start gap-3 p-3 rounded-lg ${
                                isPast
                                    ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                                    : 'bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10'
                            }`}
                        >
                            <Calendar className={`w-5 h-5 mt-0.5 ${isPast ? 'text-red-500' : 'text-slate-400'}`} />
                            <div className="flex-1">
                                <p className={`text-sm font-medium ${isPast ? 'text-red-700 dark:text-red-300' : 'text-slate-700 dark:text-slate-300'}`}>
                                    {isPast ? 'Passed: ' : 'Before: '}{formatDate(policy.cancelTime)}
                                </p>
                                <p className={`text-sm ${isPast ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                    Cancellation fee: {feeAmount}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    }, [cancellationPolicies?.cancelPolicyInfos, formatDate, formatPrice]);

    if (!isOpen) return null;

    // Show content immediately if we have cached data
    const showContent = !isLoading || hasCachedPolicy;

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
                                    onClick={fetchBookingDetails}
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
                                            {formatPrice(booking.total_price, booking.currency)}
                                        </span>
                                    </div>
                                </div>

                                {/* Refundable Status */}
                                <div className={`flex items-center gap-2 p-3 rounded-lg mb-5 ${
                                    isCurrentlyFreeCancellation
                                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                                        : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                                }`}>
                                    {isCurrentlyFreeCancellation ? (
                                        <Check className="w-5 h-5" />
                                    ) : (
                                        <AlertTriangle className="w-5 h-5" />
                                    )}
                                    <span className="font-medium text-sm">
                                        {isCurrentlyFreeCancellation
                                            ? 'Free cancellation — full refund if cancelled now'
                                            : 'This booking may not be fully refundable'}
                                    </span>
                                </div>

                                {/* Current Refund Amount */}
                                {currentCancellationFee && (
                                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 mb-5">
                                        <div className="flex items-center gap-2 mb-2">
                                            <DollarSign className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                            <span className="font-medium text-blue-900 dark:text-blue-100">
                                                If you cancel now:
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 mt-3">
                                            <div>
                                                <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">Cancellation Fee</p>
                                                <p className="text-lg font-bold text-blue-900 dark:text-blue-100">
                                                    {formatPrice(currentCancellationFee.fee, currentCancellationFee.currency)}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-green-600 dark:text-green-400 mb-1">You'll Receive</p>
                                                <p className="text-lg font-bold text-green-700 dark:text-green-300">
                                                    {formatPrice(currentCancellationFee.refund, currentCancellationFee.currency)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Cancellation Policies */}
                                <div className="mb-5">
                                    <h4 className="font-medium text-slate-900 dark:text-white mb-3">
                                        Cancellation Policy Timeline
                                    </h4>
                                    {renderCancellationPolicies()}
                                </div>

                                {/* Hotel Remarks */}
                                {cancellationPolicies?.hotelRemarks &&
                                 cancellationPolicies.hotelRemarks.length > 0 && (
                                    <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4">
                                        <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-2 text-sm">
                                            Important Notes
                                        </h4>
                                        <ul className="space-y-1">
                                            {cancellationPolicies.hotelRemarks.map((remark: string, idx: number) => (
                                                <li key={idx} className="text-xs text-amber-700 dark:text-amber-300">
                                                    • {remark}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center gap-3 p-5 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
                        <button
                            onClick={onClose}
                            disabled={isCancelling}
                            className="flex-1 py-3 px-4 text-slate-700 dark:text-slate-300 font-medium rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
                        >
                            Keep Booking
                        </button>
                        <button
                            onClick={handleCancel}
                            disabled={isLoading || isCancelling}
                            className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isCancelling ? (
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
