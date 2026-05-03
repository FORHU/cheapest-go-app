"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { 
    CalendarDays, ChevronLeft, ChevronRight, ChevronDown, 
    Loader2, Sparkles, X, Info, Calendar
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUserCurrency } from '@/stores/searchStore';
import { formatPrice as fmt } from '@/utils/flight-utils';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';

interface PriceEntry {
    price: number;
    currency: string;
}

interface PriceCalendarProps {
    origin: string;
    destination: string;
    adults: number;
    cabin: string;
    initialDate: string; // YYYY-MM-DD
    variant?: 'inline' | 'trigger';
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function PriceCalendar({
    origin,
    destination,
    adults,
    cabin,
    initialDate,
    variant = 'inline'
}: PriceCalendarProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const targetCurrency = useUserCurrency();

    const [open, setOpen] = useState(false);
    const [month, setMonth] = useState(() => new Date(initialDate).getMonth() + 1);
    const [year, setYear] = useState(() => new Date(initialDate).getFullYear());
    const [prices, setPrices] = useState<Record<string, PriceEntry>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [loadingCache, setLoadingCache] = useState(false);
    const [showTip, setShowTip] = useState(true);

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    // Fetch prices for current month/year view
    useEffect(() => {
        if (!open) return;

        const fetchPrices = async () => {
            setIsLoading(true);
            try {
                const res = await fetch(`/api/flights/price-calendar?origin=${origin}&destination=${destination}&month=${month}&year=${year}&adults=${adults}&cabin=${cabin}`);
                const json = await res.json();
                if (json.success) {
                    setPrices(prev => ({ ...prev, ...json.data }));
                }
            } catch (err) {
                console.error('Failed to fetch prices:', err);
            } finally {
                setIsLoading(false);
                setLoadingCache(false);
            }
        };

        fetchPrices();
    }, [open, month, year, origin, destination, adults, cabin]);

    const changeMonth = (delta: number) => {
        let newMonth = month + delta;
        let newYear = year;
        if (newMonth > 12) {
            newMonth = 1;
            newYear++;
        } else if (newMonth < 1) {
            newMonth = 12;
            newYear--;
        }
        setMonth(newMonth);
        setYear(newYear);
    };

    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();

    const cells = useMemo(() => {
        const arr = [];
        for (let i = 0; i < firstDay; i++) arr.push(null);
        for (let i = 1; i <= daysInMonth; i++) arr.push(i);
        return arr;
    }, [firstDay, daysInMonth]);

    const monthMinEntry = useMemo(() => {
        const entries = Object.entries(prices).filter(([date]) => {
            const d = new Date(date);
            return d.getMonth() + 1 === month && d.getFullYear() === year;
        });
        if (entries.length === 0) return null;
        return entries.reduce((prev, curr) => (prev[1].price < curr[1].price ? prev : curr));
    }, [prices, month, year]);

    const bestPrice = monthMinEntry 
        ? fmt(monthMinEntry[1].price, monthMinEntry[1].currency, targetCurrency)
        : null;

    const handleDay = (day: number) => {
        const d = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (d < todayStr) return;
        const p = new URLSearchParams(searchParams.toString());
        p.set('departure', d);
        router.push(`/flights/search?${p.toString()}`);
        setOpen(false);
    };

    const calendarContent = (
        <div className="flex flex-col h-full lg:h-auto overflow-hidden">
            {/* Header for Modal Mode */}
            {variant === 'trigger' && (
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
                    <div>
                        <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Explore Prices</h2>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mt-0.5">{origin} → {destination}</p>
                    </div>
                    <button 
                        onClick={() => setOpen(false)}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            {/* Friendly tip banner */}
            {showTip && (
                <div className="mx-4 mt-4 flex items-start gap-3 bg-blue-50/50 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/10 rounded-xl px-4 py-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center shrink-0 mt-0.5">
                        <Info size={14} className="text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider">Quick Pro Tip</p>
                        <p className="text-[11px] text-blue-600 dark:text-blue-400 leading-relaxed mt-0.5">
                            Click any date to instantly search. Fares are updated in real-time. 
                            <span className="text-emerald-500 font-bold"> Green values</span> are the cheapest found!
                        </p>
                    </div>
                    <button
                        onClick={(e) => { e.stopPropagation(); setShowTip(false); }}
                        className="text-slate-400 hover:text-slate-600 transition-colors shrink-0"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* Month nav */}
            <div className="flex items-center justify-between px-6 py-4">
                <button onClick={() => changeMonth(-1)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">
                    {MONTHS[month - 1]} {year}
                </span>
                <button onClick={() => changeMonth(1)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    <ChevronRight size={16} />
                </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 px-4">
                {DAYS.map(d => (
                    <div key={d} className="py-2 text-center text-[9px] font-black text-slate-400 uppercase tracking-widest">{d}</div>
                ))}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-7 px-4 pb-6 gap-1 overflow-y-auto">
                {cells.map((day, i) => {
                    if (!day) return <div key={`e${i}`} />;
                    const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const p = prices[key];
                    const past = key < todayStr;
                    const selected = key === initialDate;

                    // Calculate color based on relative price
                    let colorClass = 'text-slate-500 dark:text-slate-400';
                    if (p && monthMinEntry) {
                        if (p.price <= monthMinEntry[1].price * 1.05) colorClass = 'text-emerald-500';
                        else if (p.price >= monthMinEntry[1].price * 1.5) colorClass = 'text-red-500';
                    }

                    return (
                        <button
                            key={day}
                            onClick={() => handleDay(day)}
                            disabled={past}
                            className={`flex flex-col items-center justify-center rounded-xl py-2 min-h-[52px] transition-all
                                ${past ? 'opacity-20 cursor-not-allowed' : 'cursor-pointer hover:bg-white dark:hover:bg-slate-800 hover:shadow-lg hover:-translate-y-1 active:scale-95'}
                                ${selected ? 'bg-blue-600 !text-white shadow-lg shadow-blue-500/40 ring-4 ring-blue-500/20' : 'bg-transparent'}
                            `}
                        >
                            <span className={`text-[10px] font-black tracking-tighter ${selected ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                                {day}
                            </span>
                            {p && (
                                <span className={`text-[8px] font-black mt-0.5 tabular-nums ${selected ? 'text-blue-100' : colorClass}`}>
                                    {fmt(p.price, p.currency, targetCurrency)}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );

    if (variant === 'trigger') {
        return (
            <>
                <button
                    onClick={() => setOpen(true)}
                    className="relative w-10 h-10 flex items-center justify-center rounded-xl bg-blue-500/10 border border-blue-500/20 group hover:scale-110 active:scale-95 transition-all"
                >
                    <Calendar size={18} className="text-blue-500" />
                    <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full shadow-sm" />
                </button>

                {typeof window !== 'undefined' && open && createPortal(
                    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-none">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setOpen(false)}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
                        />
                        <motion.div 
                            initial={{ y: '100%', opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: '100%', opacity: 0 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="relative w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden pointer-events-auto max-h-[90vh]"
                        >
                            {calendarContent}
                        </motion.div>
                    </div>,
                    document.body
                )}
            </>
        );
    }

    return (
        <div className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-200/50 dark:border-slate-800/50 overflow-hidden shadow-sm">
            {/* Toggle header */}
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center gap-3 px-4 py-3 sm:px-6 sm:py-4 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-all text-left group"
            >
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-500/20 group-hover:scale-110 transition-transform">
                    <CalendarDays size={16} className="text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <span className="block text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-[0.2em]">
                        Explore prices by date
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200">
                            Flexible with your dates?
                        </span>
                        {bestPrice && !open && (
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 animate-pulse">
                                <Sparkles size={10} className="text-emerald-500" />
                                <span className="text-xs font-black">From {bestPrice}</span>
                            </div>
                        )}
                    </div>
                </div>

                {isLoading && (
                    <span className="flex items-center gap-1 text-[10px] text-slate-400 mr-1">
                        <Loader2 size={10} className="animate-spin" />
                        Fetching live prices…
                    </span>
                )}

                <ChevronDown 
                    size={18} 
                    className={`text-slate-400 transition-all duration-300 ${open ? 'rotate-180' : ''}`} 
                />
            </button>

            {open && (
                <div className="border-t border-slate-100 dark:border-slate-800">
                    {calendarContent}
                </div>
            )}
        </div>
    );
}
