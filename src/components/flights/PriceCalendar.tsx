'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, ChevronDown, CalendarDays, Loader2, Sparkles, X } from 'lucide-react';
import { useUserCurrency } from '@/stores/searchStore';
import { formatPrice } from '@/utils/flight-utils';

interface DayPrice {
    price: number;
    currency: string;
    live?: boolean;
}

interface PriceCalendarProps {
    origin: string;
    destination: string;
    adults?: number;
    cabin?: string;
    initialDate?: string;
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

function getMinMax(prices: Record<string, DayPrice>) {
    const vals = Object.values(prices).map(p => p.price);
    if (!vals.length) return { min: 0, max: 0 };
    return { min: Math.min(...vals), max: Math.max(...vals) };
}

function priceColorClass(price: number, min: number, max: number) {
    if (max === min) return 'text-emerald-500 dark:text-emerald-400';
    const r = (price - min) / (max - min);
    if (r < 0.33) return 'text-emerald-500 dark:text-emerald-400';
    if (r < 0.66) return 'text-amber-500 dark:text-amber-400';
    return 'text-red-500 dark:text-red-400';
}

function fmt(price: number, currency: string, targetCurrency?: string) {
    return formatPrice(price, currency, targetCurrency);
}

function closestDates(dates: string[], anchor: string, n: number): string[] {
    return [...dates]
        .sort((a, b) =>
            Math.abs(new Date(a).getTime() - new Date(anchor).getTime()) -
            Math.abs(new Date(b).getTime() - new Date(anchor).getTime())
        )
        .slice(0, n);
}

export default function PriceCalendar({
    origin, destination, adults = 1, cabin = 'economy', initialDate,
}: PriceCalendarProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const targetCurrency = useUserCurrency();

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const seed = initialDate ? new Date(initialDate + 'T00:00:00') : today;

    const [open, setOpen] = useState(false);
    const [year, setYear] = useState(seed.getFullYear());
    const [month, setMonth] = useState(seed.getMonth() + 1);
    const [prices, setPrices] = useState<Record<string, DayPrice>>({});
    const [loadingCache, setLoadingCache] = useState(false);
    const [loadingLive, setLoadingLive] = useState(false);
    const [showTip, setShowTip] = useState(true);
    // Track which month has already been fetched so we don't re-fetch on re-open
    const fetchedRef = useRef<Set<string>>(new Set());

    const daysInMonth = new Date(year, month, 0).getDate();

    const fetchForMonth = useCallback(async (y: number, m: number) => {
        const key = `${y}-${m}`;
        if (fetchedRef.current.has(key)) return; // already fetched this month
        fetchedRef.current.add(key);

        // 1. Cache first
        setLoadingCache(true);
        let cached: Record<string, DayPrice> = {};
        try {
            const res = await fetch(
                `/api/flights/price-calendar?origin=${origin}&destination=${destination}&year=${y}&month=${m}&adults=${adults}&cabin=${cabin}`
            );
            if (res.ok) { const j = await res.json(); cached = j.data ?? {}; }
        } finally { setLoadingCache(false); }

        setPrices(prev => ({ ...prev, ...cached }));

        // 2. Find uncached future days in this month and fetch live
        const monthDays = Array.from({ length: new Date(y, m, 0).getDate() }, (_, i) => {
            const d = String(i + 1).padStart(2, '0');
            return `${y}-${String(m).padStart(2, '0')}-${d}`;
        }).filter(d => d >= todayStr);

        const uncached = monthDays.filter(d => !cached[d]);
        if (!uncached.length) return;

        const anchor = initialDate && monthDays.includes(initialDate) ? initialDate : (monthDays[0] ?? todayStr);
        const toFetch = closestDates(uncached, anchor, 7);

        setLoadingLive(true);
        try {
            const res = await fetch('/api/flights/price-calendar-live', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ origin, destination, adults, cabin, dates: toFetch }),
            });
            if (res.ok) {
                const j = await res.json();
                const live: Record<string, DayPrice> = {};
                for (const [k, v] of Object.entries(j.data ?? {})) {
                    live[k] = { ...(v as DayPrice), live: true };
                }
                setPrices(prev => ({ ...prev, ...live }));
            }
        } finally { setLoadingLive(false); }
    }, [origin, destination, adults, cabin, initialDate, todayStr]);

    // Prefetch on mount — so data is ready before user opens the calendar
    useEffect(() => {
        if (origin && destination) fetchForMonth(year, month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Also fetch when month changes (navigation)
    const changeMonth = (dir: 1 | -1) => {
        const newMonth = month + dir;
        let newYear = year;
        let adjustedMonth = newMonth;
        if (newMonth < 1) { newYear = year - 1; adjustedMonth = 12; }
        if (newMonth > 12) { newYear = year + 1; adjustedMonth = 1; }
        setYear(newYear);
        setMonth(adjustedMonth);
        fetchForMonth(newYear, adjustedMonth);
    };

    const firstDay = new Date(year, month - 1, 1).getDay();
    const cells: (number | null)[] = [
        ...Array(firstDay).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    const { min, max } = getMinMax(prices);
    const priceCount = Object.keys(prices).length;
    const isLoading = loadingCache || loadingLive;

    // Cheapest price in this month for the header badge
    const monthPrices = Object.entries(prices)
        .filter(([k]) => k.startsWith(`${year}-${String(month).padStart(2, '0')}`))
        .map(([, v]) => v.price);
    const monthMin = monthPrices.length ? Math.min(...monthPrices) : null;
    const monthMinEntry = monthMin !== null
        ? Object.entries(prices).find(([k, v]) => k.startsWith(`${year}-${String(month).padStart(2, '0')}`) && v.price === monthMin)
        : null;

    const handleDay = (day: number) => {
        const d = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (d < todayStr) return;
        const p = new URLSearchParams(searchParams.toString());
        p.set('departure', d);
        router.push(`/flights/search?${p.toString()}`);
    };

    return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
            {/* Toggle header */}
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left"
            >
                <CalendarDays size={14} className="text-blue-500 shrink-0" />
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex-1">
                    Explore prices by date
                </span>

                {/* Collapsed state: show cheapest badge or loading indicator */}
                {!open && (
                    isLoading ? (
                        <span className="flex items-center gap-1 text-[10px] text-slate-400 mr-1">
                            <Loader2 size={10} className="animate-spin" />
                            Checking prices…
                        </span>
                    ) : monthMinEntry ? (
                        <span className="mr-1 flex items-center gap-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-700">
                            <Sparkles size={9} />
                            From {fmt(monthMinEntry[1].price, monthMinEntry[1].currency, targetCurrency)}
                        </span>
                    ) : null
                )}

                {open && isLoading && (
                    <span className="flex items-center gap-1 text-[10px] text-slate-400 mr-1">
                        <Loader2 size={10} className="animate-spin" />
                        {loadingCache ? 'Loading…' : 'Fetching live prices…'}
                    </span>
                )}

                <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 shrink-0 ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="border-t border-slate-100 dark:border-slate-800">
                    {/* Friendly tip banner */}
                    {showTip && (
                        <div className="mx-3 mt-3 flex items-start gap-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg px-3 py-2">
                            <Sparkles size={13} className="text-blue-500 shrink-0 mt-0.5" />
                            <p className="text-[11px] text-blue-700 dark:text-blue-300 flex-1 leading-relaxed">
                                <strong>Tip:</strong> These are real fares for nearby dates.
                                Green = cheapest, red = most expensive.
                                Click any date to instantly search flights on that day.
                            </p>
                            <button
                                onClick={(e) => { e.stopPropagation(); setShowTip(false); }}
                                className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-200 transition-colors shrink-0"
                            >
                                <X size={12} />
                            </button>
                        </div>
                    )}

                    {/* Month nav */}
                    <div className="flex items-center justify-between px-4 py-2">
                        <button onClick={() => changeMonth(-1)} className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors">
                            <ChevronLeft size={14} />
                        </button>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                            {MONTHS[month - 1]} {year}
                        </span>
                        <button onClick={() => changeMonth(1)} className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors">
                            <ChevronRight size={14} />
                        </button>
                    </div>

                    {/* Day headers */}
                    <div className="grid grid-cols-7 px-2">
                        {DAYS.map(d => (
                            <div key={d} className="py-1 text-center text-[9px] font-bold text-slate-400 uppercase tracking-wider">{d}</div>
                        ))}
                    </div>

                    {/* Grid */}
                    <div className="grid grid-cols-7 px-2 pb-3 gap-y-0.5">
                        {cells.map((day, i) => {
                            if (!day) return <div key={`e${i}`} />;
                            const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            const p = prices[key];
                            const past = key < todayStr;
                            const isToday = key === todayStr;
                            const selected = key === initialDate;

                            return (
                                <button
                                    key={day}
                                    onClick={() => handleDay(day)}
                                    disabled={past}
                                    title={p ? `${fmt(p.price, p.currency, targetCurrency)} — click to search` : 'Click to search this date'}
                                    className={`flex flex-col items-center justify-center rounded-lg py-1 min-h-[44px] transition-all
                                        ${past ? 'opacity-25 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 hover:scale-105 active:scale-95'}
                                        ${selected ? 'bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-400 dark:ring-blue-600' : ''}
                                        ${isToday && !selected ? 'ring-1 ring-slate-300 dark:ring-slate-600' : ''}
                                    `}
                                >
                                    <span className={`text-[11px] font-semibold leading-none
                                        ${isToday ? 'text-blue-600 dark:text-blue-400' : selected ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300'}
                                    `}>
                                        {day}
                                    </span>
                                    {p ? (
                                        <span className={`text-[9px] font-bold mt-0.5 leading-none ${priceColorClass(p.price, min, max)}`}>
                                            {fmt(p.price, p.currency, targetCurrency)}
                                        </span>
                                    ) : !past && loadingLive ? (
                                        <span className="mt-0.5 w-7 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 animate-pulse" />
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 dark:border-slate-800">
                        <p className="text-[10px] text-slate-400">
                            {priceCount > 0
                                ? `${priceCount} dates with prices found`
                                : 'Searching for the best prices…'}
                        </p>
                        {priceCount > 0 && (
                            <div className="flex items-center gap-1.5">
                                <span className="text-[9px] text-emerald-500 font-semibold">Cheapest</span>
                                <div className="w-10 h-1 rounded-full bg-linear-to-r from-emerald-400 via-amber-400 to-red-400" />
                                <span className="text-[9px] text-red-500 font-semibold">Priciest</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
