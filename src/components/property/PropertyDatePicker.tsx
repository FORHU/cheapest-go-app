"use client";

import React, { useState, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Moon, Users } from 'lucide-react';
import { useBookingDates, useBookingActions } from '@/stores/bookingStore';
import { cn } from '@/lib/utils';
import { useLocale, useTranslations } from 'next-intl';

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

function todayIso() { return new Date().toISOString().slice(0, 10); }

function genMonths(locale: string): string[] {
    return Array.from({ length: 12 }, (_, i) =>
        new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(2024, i, 1))
    );
}

function genWeekdays(locale: string): string[] {
    // Jan 7 2024 is a Sunday — iterate 7 days to get Sun–Sat, matching getDay() === 0 start
    return Array.from({ length: 7 }, (_, i) =>
        new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2024, 0, 7 + i))
    );
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
    const locale = useLocale();
    const t = useTranslations('hotels.propertyDatePicker');
    const months = React.useMemo(() => genMonths(locale), [locale]);
    const wdays  = React.useMemo(() => genWeekdays(locale), [locale]);
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
                        {t('checkIn')}
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
                        {t('checkOut')}
                    </button>
            </div>

            {/* Month navigation */}
            <div className="flex items-center justify-between mb-3">
                <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <ChevronLeft size={15} className="text-slate-500" />
                </button>
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {months[view.m]} {view.y}
                </span>
                <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <ChevronRight size={15} className="text-slate-500" />
                </button>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 mb-1">
                {wdays.map((d, i) => (
                    <div key={i} className="text-center text-[10px] font-medium text-slate-400 py-0.5">{d}</div>
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
                    {step === 'in' ? t('selectCheckIn') : t('selectCheckOut')}
                </p>
                <button onClick={onClose} className="text-xs font-medium text-blue-500 hover:text-blue-600">
                    {t('done')}
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
    const locale = useLocale();
    const t = useTranslations('hotels.propertyDatePicker');
    const router = useRouter();
    const { checkIn: storeCheckIn, checkOut: storeCheckOut } = useBookingDates();
    const { setDates } = useBookingActions();

    const defaultCheckIn  = initialCheckIn  || (storeCheckIn  ? storeCheckIn.toISOString().slice(0, 10)  : '');
    const defaultCheckOut = initialCheckOut || (storeCheckOut ? storeCheckOut.toISOString().slice(0, 10) : '');

    const [checkIn,       setCheckIn]       = useState(defaultCheckIn);
    const [checkOut,      setCheckOut]      = useState(defaultCheckOut);
    const [open,          setOpen]          = useState(false);
    const [step,          setStep]          = useState<'in' | 'out'>('in');
    const [guestOpen,     setGuestOpen]     = useState(false);
    const [adultsLocal,   setAdultsLocal]   = useState(adults);
    const [childrenLocal, setChildrenLocal] = useState(childrenCount);
    const [isPending, startTransition] = useTransition();
    const containerRef = useRef<HTMLDivElement>(null);
    const guestRef     = useRef<HTMLDivElement>(null);

    // Sync URL dates into bookingStore on mount
    useEffect(() => {
        if (initialCheckIn && initialCheckOut) {
            setDates(new Date(initialCheckIn), new Date(initialCheckOut));
        }
    }, [initialCheckIn, initialCheckOut, setDates]);

    // Close date picker on outside click
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

    // Close guest picker on outside click
    useEffect(() => {
        if (!guestOpen) return;
        function onDown(e: MouseEvent) {
            if (guestRef.current && !guestRef.current.contains(e.target as Node)) {
                setGuestOpen(false);
            }
        }
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [guestOpen]);

    const nights = checkIn && checkOut
        ? Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000)
        : 0;

    const canSearch = Boolean(checkIn && checkOut && checkOut > checkIn);

    function fmtDisplay(iso: string) {
        if (!iso) return '';
        const [y, m, d] = iso.split('-').map(Number);
        return new Date(y, m - 1, d).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
    }

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
        params.set('adults',   String(adultsLocal));
        if (childrenLocal) params.set('children', String(childrenLocal));
        if (rooms > 1)     params.set('rooms',    String(rooms));
        if (currency)      params.set('currency', currency);
        if (nationality)   params.set('nationality', nationality);
        startTransition(() => {
            router.push(`/property/${propertySlug}?${params.toString()}`);
        });
    }

    const calSvg = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl p-4 md:p-5 shadow-sm">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                {t('yourStay')}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 sm:items-end">

                {/* ── Dates ── */}
                <div ref={containerRef} className="grid grid-cols-2 gap-2 flex-1 relative min-w-0">
                    {/* Check-in */}
                    <div className="min-w-0">
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">{t('checkIn')}</p>
                        <button
                            onClick={() => openPicker('in')}
                            className={cn(
                                'w-full flex items-center gap-2 px-3 py-2.5 text-sm border rounded-lg transition-colors text-left whitespace-nowrap',
                                open && step === 'in'
                                    ? 'border-blue-500 ring-2 ring-blue-500/20 bg-white dark:bg-slate-800'
                                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600',
                            )}
                        >
                            <span className="text-slate-400 shrink-0">{calSvg}</span>
                            <span className={checkIn ? 'text-slate-900 dark:text-white font-medium' : 'text-slate-400'}>
                                {checkIn ? fmtDisplay(checkIn) : t('addDate')}
                            </span>
                        </button>
                    </div>

                    {/* Check-out — nights shown in label */}
                    <div className="min-w-0">
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1">
                            {t('checkOut')}
                            {nights > 0 && (
                                <span className="flex items-center gap-0.5 text-slate-400">
                                    <Moon size={10} />
                                    {nights}n
                                </span>
                            )}
                        </p>
                        <button
                            onClick={() => openPicker('out')}
                            className={cn(
                                'w-full flex items-center gap-2 px-3 py-2.5 text-sm border rounded-lg transition-colors text-left whitespace-nowrap',
                                open && step === 'out'
                                    ? 'border-blue-500 ring-2 ring-blue-500/20 bg-white dark:bg-slate-800'
                                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600',
                            )}
                        >
                            <span className="text-slate-400 shrink-0">{calSvg}</span>
                            <span className={checkOut ? 'text-slate-900 dark:text-white font-medium' : 'text-slate-400'}>
                                {checkOut ? fmtDisplay(checkOut) : t('addDate')}
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

                {/* ── Guests picker ── */}
                <div className="flex items-end gap-3">
                    <div ref={guestRef} className="relative">
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">{t('guests')}</p>
                        <button
                            onClick={() => setGuestOpen(v => !v)}
                            className={cn(
                                'flex items-center gap-1.5 px-3 py-2.5 text-sm border rounded-lg transition-colors whitespace-nowrap',
                                guestOpen
                                    ? 'border-blue-500 ring-2 ring-blue-500/20 bg-white dark:bg-slate-800'
                                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600',
                            )}
                        >
                            <Users size={13} className="text-slate-400 shrink-0" />
                            <span className="text-slate-900 dark:text-white font-medium whitespace-nowrap">
                                {adultsLocal} {adultsLocal === 1 ? t('adult') : t('adults')}
                                {childrenLocal > 0 && `, ${childrenLocal} ${childrenLocal === 1 ? t('child') : t('children')}`}
                            </span>
                        </button>

                        {guestOpen && (
                            <div className="absolute top-full right-0 mt-2 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 p-4 space-y-3">
                                {/* Adults */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-medium text-slate-900 dark:text-white">{t('adultsLabel')}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setAdultsLocal(v => Math.max(1, v - 1))}
                                            disabled={adultsLocal <= 1}
                                            className="w-7 h-7 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 hover:border-blue-400 hover:text-blue-500 disabled:opacity-30 transition-colors"
                                        >−</button>
                                        <span className="w-4 text-center text-sm font-medium text-slate-900 dark:text-white">{adultsLocal}</span>
                                        <button
                                            onClick={() => setAdultsLocal(v => Math.min(10, v + 1))}
                                            disabled={adultsLocal >= 10}
                                            className="w-7 h-7 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 hover:border-blue-400 hover:text-blue-500 disabled:opacity-30 transition-colors"
                                        >+</button>
                                    </div>
                                </div>
                                {/* Children */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-medium text-slate-900 dark:text-white">{t('childrenLabel')}</p>
                                        <p className="text-[10px] text-slate-400">{t('childrenAges')}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setChildrenLocal(v => Math.max(0, v - 1))}
                                            disabled={childrenLocal <= 0}
                                            className="w-7 h-7 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 hover:border-blue-400 hover:text-blue-500 disabled:opacity-30 transition-colors"
                                        >−</button>
                                        <span className="w-4 text-center text-sm font-medium text-slate-900 dark:text-white">{childrenLocal}</span>
                                        <button
                                            onClick={() => setChildrenLocal(v => Math.min(6, v + 1))}
                                            disabled={childrenLocal >= 6}
                                            className="w-7 h-7 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 hover:border-blue-400 hover:text-blue-500 disabled:opacity-30 transition-colors"
                                        >+</button>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setGuestOpen(false)}
                                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors"
                                >
                                    {t('done')}
                                </button>
                            </div>
                        )}
                    </div>
                    <div>
                    <p className="text-xs text-transparent mb-1.5 select-none">·</p>
                    <button
                        onClick={handleSearch}
                        disabled={!canSearch || isPending}
                        className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors shrink-0 min-w-[160px] justify-center"
                    >
                        {isPending ? (
                            <>
                                <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                                {t('searching')}
                            </>
                        ) : (
                            <>
                                {t('checkAvailability')}
                                <ChevronRight size={14} />
                            </>
                        )}
                    </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
