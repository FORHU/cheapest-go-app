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
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-white/10 p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Who is the booking for?</h2>
            <div className="flex gap-4 mb-4">
                <button
                    className={`flex-1 py-2 rounded-lg border ${bookingFor === 'myself' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200'}`}
                    onClick={() => onBookingForChange('myself')}
                >
                    Myself
                </button>
                <button
                    className={`flex-1 py-2 rounded-lg border ${bookingFor === 'someone_else' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200'}`}
                    onClick={() => onBookingForChange('someone_else')}
                >
                    Someone else
                </button>
            </div>
            {bookingFor === 'someone_else' && (
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Guest First Name *</label>
                        <input
                            name="guestFirstName"
                            value={formData.guestFirstName}
                            onChange={onInputChange}
                            type="text"
                            className={`w-full p-3 rounded-lg border bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500 ${errors.guestFirstName ? 'border-red-400' : 'border-slate-200 dark:border-white/10'}`}
                        />
                        <FieldError message={errors.guestFirstName} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Guest Last Name *</label>
                        <input
                            name="guestLastName"
                            value={formData.guestLastName}
                            onChange={onInputChange}
                            type="text"
                            className={`w-full p-3 rounded-lg border bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500 ${errors.guestLastName ? 'border-red-400' : 'border-slate-200 dark:border-white/10'}`}
                        />
                        <FieldError message={errors.guestLastName} />
                    </div>
                </div>
            )}
        </div>
    );
}
