"use client";

import React, { useState, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Moon } from 'lucide-react';
import { useBookingDates, useBookingActions } from '@/stores/bookingStore';
import { cn } from '@/lib/utils';

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

// ─── helpers ──────────────────────────────────────────────────────────────────

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
const WDAYS  = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function todayIso() { return new Date().toISOString().slice(0, 10); }

function fmtDisplay(iso: string) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── CalendarPanel ────────────────────────────────────────────────────────────

function CalendarPanel({
    checkIn, checkOut,
    step, setStep,
    onSelect, onClose,
}: {
    checkIn: string; checkOut: string;
    step: 'in' | 'out'; setStep: (s: 'in' | 'out') => void;
    onSelect: (field: 'in' | 'out', v: string) => void;
    onClose: () => void;
}) {
    const today = todayIso();
    const [hover, setHover] = useState('');

    const initView = () => {
        const ref = checkIn || today;
        const [y, m] = ref.split('-').map(Number);
        return { y, m: m - 1 };
    };
    const [view, setView] = useState(initView);

    const prevMonth = () => setView(v => v.m === 0 ? { y: v.y - 1, m: 11 } : { ...v, m: v.m - 1 });
    const nextMonth = () => setView(v => v.m === 11 ? { y: v.y + 1, m: 0 } : { ...v, m: v.m + 1 });

    const daysInMonth  = new Date(view.y, view.m + 1, 0).getDate();
    const startOffset  = new Date(view.y, view.m, 1).getDay();

    function dayIso(d: number) {
        return `${view.y}-${String(view.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    function handleDay(iso: string) {
        if (iso < today) return;
        if (step === 'in') {
            onSelect('in', iso);
            if (checkOut && iso >= checkOut) onSelect('out', '');
            setStep('out');
        } else {
            if (checkIn && iso <= checkIn) {
                // clicked before check-in — restart
                onSelect('in', iso);
                onSelect('out', '');
            } else {
                onSelect('out', iso);
                onClose();
            }
        }
    }

    const rangeEnd = step === 'out' && hover ? hover : checkOut;

    return (
        <div className="absolute top-full left-0 mt-2 z-50 w-[300px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-4 select-none">
            {/* Step indicator */}
            <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 mb-4 text-xs font-medium">
                <button
                    onClick={() => setStep('in')}
                    className={cn(
                        'flex-1 py-1.5 transition-colors',
                        step === 'in'
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800',
                    )}
                >
                    Check-in
                </button>
                <button
                    onClick={() => setStep('out')}
                    className={cn(
                        'flex-1 py-1.5 transition-colors',
                        step === 'out'
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800',
                    )}
                >
                    Check-out
                </button>
            </div>

            {/* Month navigation */}
            <div className="flex items-center justify-between mb-3">
                <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <ChevronLeft size={15} className="text-slate-500" />
                </button>
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {MONTHS[view.m]} {view.y}
                </span>
                <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <ChevronRight size={15} className="text-slate-500" />
                </button>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 mb-1">
                {WDAYS.map(d => (
                    <div key={d} className="text-center text-[10px] font-medium text-slate-400 py-0.5">{d}</div>
                ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7">
                {Array.from({ length: startOffset }, (_, i) => <div key={`e${i}`} />)}
                {Array.from({ length: daysInMonth }, (_, i) => {
                    const iso    = dayIso(i + 1);
                    const past   = iso < today;
                    const isIn   = iso === checkIn;
                    const isOut  = iso === checkOut;
                    const inRng  = !!(checkIn && rangeEnd && iso > checkIn && iso < rangeEnd);

                    return (
                        <div
                            key={iso}
                            className={cn(
                                'relative flex items-center justify-center h-9',
                                inRng  ? 'bg-blue-50 dark:bg-blue-900/30' : '',
                                isIn  && (checkOut || (step === 'out' && hover > checkIn))
                                    ? 'bg-blue-50 dark:bg-blue-900/30 rounded-l-full' : '',
                                isOut  ? 'bg-blue-50 dark:bg-blue-900/30 rounded-r-full' : '',
                            )}
                        >
                            <button
                                disabled={past}
                                onClick={() => handleDay(iso)}
                                onMouseEnter={() => { if (!past) setHover(iso); }}
                                onMouseLeave={() => setHover('')}
                                className={cn(
                                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                                    past
                                        ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                                        : 'cursor-pointer',
                                    (isIn || isOut)
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : '',
                                    !isIn && !isOut && !past
                                        ? inRng
                                            ? 'text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50'
                                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                                        : '',
                                )}
                            >
                                {i + 1}
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* Footer */}
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <p className="text-xs text-slate-400">
                    {step === 'in' ? 'Select check-in date' : 'Select check-out date'}
                </p>
                <button onClick={onClose} className="text-xs font-medium text-blue-500 hover:text-blue-600">
                    Done
                </button>
            </div>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

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

    const defaultCheckIn  = initialCheckIn  || (storeCheckIn  ? storeCheckIn.toISOString().slice(0, 10)  : '');
    const defaultCheckOut = initialCheckOut || (storeCheckOut ? storeCheckOut.toISOString().slice(0, 10) : '');

    const [checkIn,  setCheckIn]  = useState(defaultCheckIn);
    const [checkOut, setCheckOut] = useState(defaultCheckOut);
    const [open,     setOpen]     = useState(false);
    const [step,     setStep]     = useState<'in' | 'out'>('in');
    const [isPending, startTransition] = useTransition();
    const containerRef = useRef<HTMLDivElement>(null);

    // Sync URL dates into bookingStore on mount
    useEffect(() => {
        if (initialCheckIn && initialCheckOut) {
            setDates(new Date(initialCheckIn), new Date(initialCheckOut));
        }
    }, [initialCheckIn, initialCheckOut, setDates]);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        function onDown(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    const nights = checkIn && checkOut
        ? Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000)
        : 0;

    const canSearch = Boolean(checkIn && checkOut && checkOut > checkIn);

    function openPicker(s: 'in' | 'out') {
        setStep(s);
        setOpen(true);
    }

    function handleSelect(field: 'in' | 'out', v: string) {
        if (field === 'in')  setCheckIn(v);
        if (field === 'out') setCheckOut(v);
    }

    function handleSearch() {
        if (!canSearch || isPending) return;
        setDates(new Date(checkIn), new Date(checkOut));
        const params = new URLSearchParams();
        params.set('checkIn',  checkIn);
        params.set('checkOut', checkOut);
        params.set('adults',   String(adults));
        if (childrenCount) params.set('children', String(childrenCount));
        if (rooms > 1)     params.set('rooms',    String(rooms));
        if (currency)      params.set('currency', currency);
        if (nationality)   params.set('nationality', nationality);
        startTransition(() => {
            router.push(`/property/${propertySlug}?${params.toString()}`);
        });
    }

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl p-4 md:p-5 shadow-sm">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                Your stay
            </p>

            <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                {/* Date trigger buttons */}
                <div ref={containerRef} className="grid grid-cols-2 gap-3 flex-1 relative">
                    {/* Check-in */}
                    <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">Check-in</p>
                        <button
                            onClick={() => openPicker('in')}
                            className={cn(
                                'w-full flex items-center gap-2 px-3 py-2.5 text-sm border rounded-lg transition-colors text-left',
                                open && step === 'in'
                                    ? 'border-blue-500 ring-2 ring-blue-500/20 bg-white dark:bg-slate-800'
                                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600',
                            )}
                        >
                            <span className="text-slate-400 shrink-0">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                            </span>
                            <span className={checkIn ? 'text-slate-900 dark:text-white font-medium' : 'text-slate-400'}>
                                {checkIn ? fmtDisplay(checkIn) : 'Add date'}
                            </span>
                        </button>
                    </div>

                    {/* Check-out */}
                    <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">Check-out</p>
                        <button
                            onClick={() => openPicker('out')}
                            className={cn(
                                'w-full flex items-center gap-2 px-3 py-2.5 text-sm border rounded-lg transition-colors text-left',
                                open && step === 'out'
                                    ? 'border-blue-500 ring-2 ring-blue-500/20 bg-white dark:bg-slate-800'
                                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600',
                            )}
                        >
                            <span className="text-slate-400 shrink-0">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                            </span>
                            <span className={checkOut ? 'text-slate-900 dark:text-white font-medium' : 'text-slate-400'}>
                                {checkOut ? fmtDisplay(checkOut) : 'Add date'}
                            </span>
                        </button>
                    </div>

                    {/* Calendar dropdown */}
                    {open && (
                        <CalendarPanel
                            checkIn={checkIn}
                            checkOut={checkOut}
                            step={step}
                            setStep={setStep}
                            onSelect={handleSelect}
                            onClose={() => setOpen(false)}
                        />
                    )}
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
                        disabled={!canSearch || isPending}
                        className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors shrink-0 min-w-[160px] justify-center"
                    >
                        {isPending ? (
                            <>
                                <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                                Searching…
                            </>
                        ) : (
                            <>
                                Check availability
                                <ChevronRight size={14} />
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
