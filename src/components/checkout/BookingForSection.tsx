'use client';

import React from 'react';
import { CheckoutFormData, BookingForType } from './types';

interface BookingForSectionProps {
    bookingFor: BookingForType;
    onBookingForChange: (value: BookingForType) => void;
    formData: CheckoutFormData;
    onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
}

export function BookingForSection({
    bookingFor,
    onBookingForChange,
    formData,
    onInputChange,
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
                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Guest First Name</label>
                        <input
                            name="guestFirstName"
                            value={formData.guestFirstName}
                            onChange={onInputChange}
                            type="text"
                            className="w-full p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Guest Last Name</label>
                        <input
                            name="guestLastName"
                            value={formData.guestLastName}
                            onChange={onInputChange}
                            type="text"
                            className="w-full p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
