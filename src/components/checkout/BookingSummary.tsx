'use client';

import React from 'react';

interface BookingSummaryProps {
    propertyName: string;
    roomTitle: string;
    roomPrice: number;
    totalNights: number;
    adults: number;
    children: number;
    taxes: number;
    totalPrice: number;
    prebookId: string | null | undefined;
}

export function BookingSummary({
    propertyName,
    roomTitle,
    roomPrice,
    totalNights,
    adults,
    children,
    taxes,
    totalPrice,
    prebookId,
}: BookingSummaryProps) {
    return (
        <div className="lg:col-span-1">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-white/10 p-6 shadow-lg sticky top-24">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Booking Summary</h3>

                <div className="mb-6">
                    <div className="font-bold text-slate-900 dark:text-white">{propertyName}</div>
                    <div className="text-sm text-slate-500">{roomTitle}</div>
                </div>

                <div className="space-y-4 border-t border-slate-100 dark:border-white/5 pt-4 mb-6">
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">Guests</span>
                        <span className="font-medium text-slate-900 dark:text-white">{adults} Adults, {children} Children</span>
                    </div>
                    {prebookId && (
                        <div className="flex justify-between text-sm items-center">
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold text-xs bg-emerald-100 dark:bg-emerald-900/30 px-2 py-1 rounded">Room Confirmed</span>
                        </div>
                    )}
                </div>

                <div className="space-y-2 border-t border-slate-100 dark:border-white/5 pt-4">
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">{totalNights} nights x ₱{roomPrice.toLocaleString()}</span>
                        <span className="font-medium text-slate-900 dark:text-white">₱{(roomPrice * totalNights).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">Taxes & fees</span>
                        <span className="font-medium text-slate-900 dark:text-white">₱{taxes.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold mt-2 pt-2 border-t border-slate-100 dark:border-white/5">
                        <span className="text-slate-900 dark:text-white">Total</span>
                        <span className="text-slate-900 dark:text-white">₱{(totalPrice || 0).toLocaleString()}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
