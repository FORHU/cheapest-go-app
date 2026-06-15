"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, ChevronRight, Moon } from 'lucide-react';
import { useBookingDates, useBookingActions } from '@/stores/bookingStore';

interface PropertyDatePickerProps {
    propertySlug: string;
    initialCheckIn?: string;
    initialCheckOut?: string;
    adults?: number;
    childrenCount?: number;
    rooms?: number;
    currency?: string;
    nationality?: string;
}

export default function PropertyDatePicker({
    propertySlug,
    initialCheckIn,
    initialCheckOut,
    adults = 2,
    childrenCount = 0,
    rooms = 1,
    currency,
    nationality,
}: PropertyDatePickerProps) {
    const router = useRouter();
    const { checkIn: storeCheckIn, checkOut: storeCheckOut } = useBookingDates();
    const { setDates } = useBookingActions();

    // URL params take priority over bookingStore
    const defaultCheckIn =
        initialCheckIn ||
        (storeCheckIn ? storeCheckIn.toISOString().slice(0, 10) : '');
    const defaultCheckOut =
        initialCheckOut ||
        (storeCheckOut ? storeCheckOut.toISOString().slice(0, 10) : '');

    const [checkIn, setCheckIn] = useState(defaultCheckIn);
    const [checkOut, setCheckOut] = useState(defaultCheckOut);

    // Sync URL dates into bookingStore on mount
    useEffect(() => {
        if (initialCheckIn && initialCheckOut) {
            setDates(new Date(initialCheckIn), new Date(initialCheckOut));
        }
    }, [initialCheckIn, initialCheckOut, setDates]);

    const today = new Date().toISOString().slice(0, 10);

    const nights =
        checkIn && checkOut
            ? Math.round(
                  (new Date(checkOut).getTime() - new Date(checkIn).getTime()) /
                      86_400_000
              )
            : 0;

    const canSearch = Boolean(checkIn && checkOut && checkOut > checkIn);

    function handleSearch() {
        if (!canSearch) return;
        setDates(new Date(checkIn), new Date(checkOut));
        const params = new URLSearchParams();
        params.set('checkIn', checkIn);
        params.set('checkOut', checkOut);
        params.set('adults', String(adults));
        if (childrenCount) params.set('children', String(childrenCount));
        if (rooms > 1) params.set('rooms', String(rooms));
        if (currency) params.set('currency', currency);
        if (nationality) params.set('nationality', nationality);
        router.push(`/property/${propertySlug}?${params.toString()}`);
    }

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl p-4 md:p-5 shadow-sm">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                Your stay
            </p>

            <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                {/* Date inputs */}
                <div className="grid grid-cols-2 gap-3 flex-1">
                    <div>
                        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                            Check-in
                        </label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 w-3.5 h-3.5 pointer-events-none" />
                            <input
                                type="date"
                                value={checkIn}
                                min={today}
                                onChange={e => {
                                    setCheckIn(e.target.value);
                                    if (checkOut && e.target.value >= checkOut) setCheckOut('');
                                }}
                                className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                            Check-out
                        </label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 w-3.5 h-3.5 pointer-events-none" />
                            <input
                                type="date"
                                value={checkOut}
                                min={checkIn || today}
                                onChange={e => setCheckOut(e.target.value)}
                                className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                            />
                        </div>
                    </div>
                </div>

                {/* Nights badge + CTA */}
                <div className="flex items-center gap-3">
                    {nights > 0 && (
                        <div className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 pb-0.5">
                            <Moon size={13} />
                            <span>{nights} {nights === 1 ? 'night' : 'nights'}</span>
                        </div>
                    )}
                    <button
                        onClick={handleSearch}
                        disabled={!canSearch}
                        className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors shrink-0"
                    >
                        Check availability
                        <ChevronRight size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
}
