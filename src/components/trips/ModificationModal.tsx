"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Pencil, Loader2 } from 'lucide-react';
import type { BookingRecord } from '@/lib/server/bookings';
import { useAmendBooking } from '@/hooks/trips';
import { amendBookingSchema, type AmendBookingInput } from '@/lib/schemas/amend';

interface ModificationModalProps {
    booking: BookingRecord;
    isOpen: boolean;
    onClose: () => void;
    onModified: () => void;
}

export default function ModificationModal({ booking, isOpen, onClose, onModified }: ModificationModalProps) {
    const amendMutation = useAmendBooking();

    const [form, setForm] = useState<AmendBookingInput>({
        firstName: booking.holder_first_name,
        lastName: booking.holder_last_name,
        email: booking.holder_email,
        remarks: booking.special_requests || '',
    });

    const [errors, setErrors] = useState<Partial<Record<keyof AmendBookingInput, string>>>({});

    // Re-initialize form when booking changes or modal opens
    useEffect(() => {
        if (isOpen) {
            setForm({
                firstName: booking.holder_first_name,
                lastName: booking.holder_last_name,
                email: booking.holder_email,
                remarks: booking.special_requests || '',
            });
            setErrors({});
        }
    }, [isOpen, booking]);

    const handleChange = (field: keyof AmendBookingInput, value: string) => {
        setForm(prev => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: undefined }));
        }
    };

    const handleSubmit = async () => {
        const result = amendBookingSchema.safeParse(form);
        if (!result.success) {
            const fieldErrors: Partial<Record<keyof AmendBookingInput, string>> = {};
            result.error.issues.forEach(err => {
                const field = err.path[0] as keyof AmendBookingInput;
                if (!fieldErrors[field]) {
                    fieldErrors[field] = err.message;
                }
            });
            setErrors(fieldErrors);
            return;
        }

        await amendMutation.mutateAsync({
            bookingId: booking.booking_id,
            firstName: form.firstName,
            lastName: form.lastName,
            email: form.email,
            remarks: form.remarks || undefined,
        });

        onModified();
        onClose();
    };

    if (!isOpen) return null;

    const hasChanges =
        form.firstName !== booking.holder_first_name ||
        form.lastName !== booking.holder_last_name ||
        form.email !== booking.holder_email ||
        (form.remarks || '') !== (booking.special_requests || '');

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
                            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                                <Pencil className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                                Modify Booking
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
                        {/* Booking Summary */}
                        <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-4 mb-5">
                            <h3 className="font-semibold text-slate-900 dark:text-white mb-1">
                                {booking.property_name}
                            </h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                Booking ID: {booking.booking_id}
                            </p>
                        </div>

                        {/* Info banner */}
                        <div className="flex items-center gap-2 p-3 rounded-lg mb-5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300">
                            <Pencil className="w-4 h-4 flex-shrink-0" />
                            <span className="text-sm">
                                You can update the booking holder&apos;s name, email, and special requests.
                            </span>
                        </div>

                        {/* Form Fields */}
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    First Name
                                </label>
                                <input
                                    type="text"
                                    value={form.firstName}
                                    onChange={(e) => handleChange('firstName', e.target.value)}
                                    className={`w-full px-4 py-2.5 rounded-xl border ${
                                        errors.firstName
                                            ? 'border-red-300 dark:border-red-500'
                                            : 'border-slate-200 dark:border-white/10'
                                    } bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors`}
                                    placeholder="First name"
                                />
                                {errors.firstName && (
                                    <p className="mt-1 text-xs text-red-500">{errors.firstName}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Last Name
                                </label>
                                <input
                                    type="text"
                                    value={form.lastName}
                                    onChange={(e) => handleChange('lastName', e.target.value)}
                                    className={`w-full px-4 py-2.5 rounded-xl border ${
                                        errors.lastName
                                            ? 'border-red-300 dark:border-red-500'
                                            : 'border-slate-200 dark:border-white/10'
                                    } bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors`}
                                    placeholder="Last name"
                                />
                                {errors.lastName && (
                                    <p className="mt-1 text-xs text-red-500">{errors.lastName}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Email
                                </label>
                                <input
                                    type="email"
                                    value={form.email}
                                    onChange={(e) => handleChange('email', e.target.value)}
                                    className={`w-full px-4 py-2.5 rounded-xl border ${
                                        errors.email
                                            ? 'border-red-300 dark:border-red-500'
                                            : 'border-slate-200 dark:border-white/10'
                                    } bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors`}
                                    placeholder="email@example.com"
                                />
                                {errors.email && (
                                    <p className="mt-1 text-xs text-red-500">{errors.email}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Special Requests
                                    <span className="text-slate-400 font-normal ml-1">(optional)</span>
                                </label>
                                <textarea
                                    value={form.remarks || ''}
                                    onChange={(e) => handleChange('remarks', e.target.value)}
                                    rows={3}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors resize-none"
                                    placeholder="e.g., Late check-in, extra pillows..."
                                />
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center gap-3 p-5 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
                        <button
                            onClick={onClose}
                            disabled={amendMutation.isPending}
                            className="flex-1 py-3 px-4 text-slate-700 dark:text-slate-300 font-medium rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
                        >
                            Discard
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={!hasChanges || amendMutation.isPending}
                            className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {amendMutation.isPending ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                'Save Changes'
                            )}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
