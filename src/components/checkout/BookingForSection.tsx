'use client';

import React from 'react';
import { CheckoutFormData, BookingForType } from './types';

interface BookingForSectionProps {
    bookingFor: BookingForType;
    onBookingForChange: (value: BookingForType) => void;
    formData: CheckoutFormData;
    onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
    errors?: Record<string, string>;
}

const FieldError = ({ message }: { message?: string }) =>
    message ? <p className="mt-1 text-xs text-red-500">{message}</p> : null;

export function BookingForSection({
    bookingFor,
    onBookingForChange,
    formData,
    onInputChange,
    errors = {},
}: BookingForSectionProps) {
    return (
        <div className="bg-white dark:bg-slate-900 rounded-lg sm:rounded-xl border border-slate-200 dark:border-white/10 p-3 sm:p-6 shadow-sm">
            <h2 className="text-base sm:text-xl font-bold text-slate-900 dark:text-white mb-2 sm:mb-4">Who is the booking for?</h2>
            <div className="flex gap-2 sm:gap-4 mb-2.5 sm:mb-4">
                <button
                    className={`flex-1 py-1.5 sm:py-2 text-xs sm:text-sm rounded sm:rounded-lg border ${bookingFor === 'myself' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200'}`}
                    onClick={() => onBookingForChange('myself')}
                >
                    Myself
                </button>
                <button
                    className={`flex-1 py-1.5 sm:py-2 text-xs sm:text-sm rounded sm:rounded-lg border ${bookingFor === 'someone_else' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200'}`}
                    onClick={() => onBookingForChange('someone_else')}
                >
                    Someone else
                </button>
            </div>
            {bookingFor === 'someone_else' && (
                <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
                    <div>
                        <label className="block text-[9px] sm:text-xs font-bold uppercase text-slate-500 mb-0.5 sm:mb-1">Guest First Name *</label>
                        <input
                            name="guestFirstName"
                            value={formData.guestFirstName}
                            onChange={onInputChange}
                            type="text"
                            className={`w-full min-w-0 px-2 py-1.5 sm:p-3 text-xs sm:text-sm rounded sm:rounded-lg border bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500 ${errors.guestFirstName ? 'border-red-400' : 'border-slate-200 dark:border-white/10'}`}
                        />
                        <FieldError message={errors.guestFirstName} />
                    </div>
                    <div>
                        <label className="block text-[9px] sm:text-xs font-bold uppercase text-slate-500 mb-0.5 sm:mb-1">Guest Last Name *</label>
                        <input
                            name="guestLastName"
                            value={formData.guestLastName}
                            onChange={onInputChange}
                            type="text"
                            className={`w-full min-w-0 px-2 py-1.5 sm:p-3 text-xs sm:text-sm rounded sm:rounded-lg border bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500 ${errors.guestLastName ? 'border-red-400' : 'border-slate-200 dark:border-white/10'}`}
                        />
                        <FieldError message={errors.guestLastName} />
                    </div>
                </div>
            )}
        </div>
    );
}
