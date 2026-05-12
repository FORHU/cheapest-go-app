"use client";

import React, { useRef, useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Calendar, ChevronDown } from 'lucide-react';
import { useSearchStore, useDates, useActiveDropdown } from '@/stores/searchStore';
import { cn } from '@/lib/utils';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

interface DatePickerProps {
    inline?: boolean;
    forceOpen?: boolean;
    onDone?: () => void;
    initialCheckOutMode?: boolean;
    /** Which activeDropdown value this instance responds to. Defaults to both 'dates-in' and 'dates-out'. */
    triggerDropdown?: 'dates-in' | 'dates-out';
}

export const DatePicker: React.FC<DatePickerProps> = ({ inline, forceOpen, onDone, initialCheckOutMode, triggerDropdown }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [view, setView] = useState<'calendar' | 'month' | 'year'>('calendar');
    const [activeTab, setActiveTab] = useState<'calendar' | 'flexible'>('calendar');
    
    // Store
    const activeDropdown = useActiveDropdown();
    const { checkIn: rawCheckIn, checkOut: rawCheckOut, flexibility } = useDates();
    const { setDates, setActiveDropdown } = useSearchStore();

    // Convert potential strings from persistence to Date objects
    const checkIn = rawCheckIn ? new Date(rawCheckIn) : null;
    const checkOut = rawCheckOut ? new Date(rawCheckOut) : null;

    const [currentMonth, setCurrentMonth] = useState(() => {
        if (checkIn && !isNaN(checkIn.getTime())) return new Date(checkIn.getFullYear(), checkIn.getMonth(), 1);
        return new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    });
    const [yearInput, setYearInput] = useState(currentMonth.getFullYear().toString());
    const [selectingCheckOut, setSelectingCheckOut] = useState(false);

    const isOpen = forceOpen || (
        triggerDropdown
            ? activeDropdown === triggerDropdown
            : (activeDropdown === 'dates-in' || activeDropdown === 'dates-out')
    );
    
    // Reset selecting mode when picker opens based on which card triggered it
    useEffect(() => {
        if (isOpen) {
            if (initialCheckOutMode) setSelectingCheckOut(true);
            else if (!checkIn) setSelectingCheckOut(false);
            else if (checkIn && !checkOut) setSelectingCheckOut(true);
            else setSelectingCheckOut(false);
        }
    }, [isOpen, initialCheckOutMode]);
    const onClose = () => {
        if (onDone) onDone();
        else if (!forceOpen) setActiveDropdown(null);
    };

    useEffect(() => {
        setYearInput(currentMonth.getFullYear().toString());
    }, [currentMonth]);

    useEffect(() => {
        if (!isOpen) setView('calendar');
    }, [isOpen]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent | TouchEvent) => {
            const target = e.target as Node;
            const trigger = ref.current?.parentElement?.querySelector('[data-datepicker-trigger]');
            const isInsideTrigger = trigger?.contains(target);
            const isOutside = ref.current && !ref.current.contains(target) && !isInsideTrigger;
            if (isOutside && document.contains(target)) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('touchstart', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [isOpen]);

    const years = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const result = [];
        for (let i = currentYear; i <= currentYear + 20; i++) {
            result.push(i);
        }
        return result;
    }, []);

    const handlePrevMonth = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    };
    const handleNextMonth = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    };

    const handleDateClick = (date: Date) => {
        if (!selectingCheckOut || !checkIn || date < checkIn) {
            setDates({ checkIn: date, checkOut: null });
            setSelectingCheckOut(true);
        } else {
            setDates({ checkOut: date });
            setSelectingCheckOut(false);
        }
    };

    const flexOptions = ['Exact dates', '± 1 day', '± 2 days', '± 3 days', '± 7 days'];

    const renderCalendar = () => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const days = [];
        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`pad-${i}`} className="size-9 sm:size-10 mx-auto" />);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dateObj = new Date(year, month, day);
            const isToday = dateObj.toDateString() === today.toDateString();
            const isPast = dateObj < today;
            const isCheckIn = checkIn && dateObj.toDateString() === checkIn.toDateString();
            const isCheckOut = checkOut && dateObj.toDateString() === checkOut.toDateString();
            const isInRange = checkIn && checkOut && dateObj > checkIn && dateObj < checkOut;

            days.push(
                <button
                    key={day}
                    type="button"
                    disabled={isPast || isToday}
                    onClick={() => handleDateClick(dateObj)}
                    className={cn(
                        "size-9 sm:size-10 mx-auto my-0.5 flex items-center justify-center text-[11px] sm:text-sm font-normal rounded-xl transition-all relative",
                        (isPast || isToday)
                            ? "text-slate-300 dark:text-slate-600 cursor-not-allowed opacity-20"
                            : "cursor-pointer hover:bg-slate-100 dark:hover:bg-white/5",
                        (isCheckIn || isCheckOut)
                            ? "bg-blue-600 text-white z-10 shadow-lg shadow-blue-600/30"
                            : isInRange
                                ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                : "text-slate-700 dark:text-slate-300",
                        isToday && !isCheckIn && !isCheckOut && "ring-1 ring-blue-500/30"
                    )}
                >
                    {day}
                </button>
            );
        }
        return days;
    };

    const formatDate = (date: Date | null) => {
        if (!date) return 'Select';
        return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    ref={ref}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className={inline
                        ? "w-full z-10"
                        : "relative sm:absolute top-0 sm:top-full left-0 sm:left-1/2 sm:-translate-x-1/2 sm:mt-4 w-full sm:w-[420px] bg-white dark:bg-obsidian shadow-2xl rounded-2xl border border-slate-200 dark:border-white/10 z-[100] overflow-hidden"}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Tabs */}
                    <div className="flex border-b border-slate-100 dark:border-white/5">
                        <button
                            onClick={() => setActiveTab('calendar')}
                            className={cn(
                                "flex-1 py-3 text-[11px] font-bold uppercase tracking-wider transition-all",
                                activeTab === 'calendar'
                                    ? "text-blue-600 border-b-2 border-blue-600"
                                    : "text-slate-400 hover:text-slate-600"
                            )}
                        >
                            Calendar
                        </button>
                        <button
                            onClick={() => setActiveTab('flexible')}
                            className={cn(
                                "flex-1 py-3 text-[11px] font-bold uppercase tracking-wider transition-all",
                                activeTab === 'flexible'
                                    ? "text-blue-600 border-b-2 border-blue-600"
                                    : "text-slate-400 hover:text-slate-600"
                            )}
                        >
                            Flexible dates
                        </button>
                    </div>

                    <div className="p-4 flex flex-col relative">
                        {activeTab === 'calendar' ? (
                            <>
                                {/* Month/Year Header */}
                                <div className="flex justify-between items-center mb-4">
                                    <div className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setView(view === 'month' ? 'calendar' : 'month')}
                                            className="flex items-center gap-1 group"
                                        >
                                            <span className="text-[11px] font-normal text-blue-600 dark:text-blue-400 uppercase tracking-widest group-hover:opacity-70 transition-opacity">
                                                {MONTHS[currentMonth.getMonth()]}
                                            </span>
                                            <div className={cn("transition-transform duration-200", view === 'month' ? "rotate-180" : "")}>
                                                <ChevronDown size={14} className="text-blue-600 dark:text-blue-400" />
                                            </div>
                                        </button>
                                        <div className="flex items-center gap-1 group relative">
                                            <input
                                                type="number"
                                                value={yearInput}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setYearInput(val);
                                                    const y = parseInt(val);
                                                    if (!isNaN(y) && y > 1900 && y < 2100) {
                                                        setCurrentMonth(new Date(y, currentMonth.getMonth(), 1));
                                                    }
                                                }}
                                                onBlur={() => {
                                                    setYearInput(currentMonth.getFullYear().toString());
                                                }}
                                                className="w-12 bg-transparent text-[11px] font-normal text-slate-600 dark:text-slate-400 uppercase tracking-widest outline-none focus:text-blue-500 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setView(view === 'year' ? 'calendar' : 'year')}
                                                className={cn("transition-transform duration-200", view === 'year' ? "rotate-180" : "")}
                                            >
                                                <ChevronDown size={14} className="text-slate-400" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={handlePrevMonth}
                                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-colors"
                                        >
                                            <ChevronLeft size={16} className="text-slate-400" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleNextMonth}
                                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-colors"
                                        >
                                            <ChevronRight size={16} className="text-slate-400" />
                                        </button>
                                    </div>
                                </div>

                                {/* Views */}
                                <div className="relative min-h-[220px]">
                                    {view === 'month' && (
                                        <div className="absolute inset-0 bg-white dark:bg-obsidian z-20 overflow-y-auto custom-scrollbar pr-1 animate-in fade-in zoom-in-95 duration-200">
                                            <div className="text-[10px] font-normal text-slate-400 uppercase tracking-widest mb-3 sticky top-0 bg-white dark:bg-obsidian py-1">Month</div>
                                            <div className="grid grid-cols-1 gap-1">
                                                {MONTHS.map((m, i) => (
                                                    <button
                                                        key={m}
                                                        type="button"
                                                        onClick={() => {
                                                            setCurrentMonth(new Date(currentMonth.getFullYear(), i, 1));
                                                            setView('calendar');
                                                        }}
                                                        className={cn(
                                                            "w-full text-left px-3 py-2 rounded-md text-[12px] font-normal transition-all",
                                                            currentMonth.getMonth() === i
                                                                ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                                                : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5"
                                                        )}
                                                    >
                                                        {m}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {view === 'year' && (
                                        <div className="absolute inset-0 bg-white dark:bg-obsidian z-20 overflow-y-auto custom-scrollbar pr-1 animate-in fade-in zoom-in-95 duration-200">
                                            <div className="text-[10px] font-normal text-slate-400 uppercase tracking-widest mb-3 sticky top-0 bg-white dark:bg-obsidian py-1">Year</div>
                                            <div className="grid grid-cols-3 gap-2">
                                                {years.map((y) => (
                                                    <button
                                                        key={y}
                                                        type="button"
                                                        onClick={() => {
                                                            setCurrentMonth(new Date(y, currentMonth.getMonth(), 1));
                                                            setView('calendar');
                                                        }}
                                                        className={cn(
                                                            "px-2 py-3 rounded-md text-[12px] font-normal transition-all text-center",
                                                            currentMonth.getFullYear() === y
                                                                ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                                                : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5"
                                                        )}
                                                    >
                                                        {y}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="animate-in fade-in duration-300">
                                        <div className="grid grid-cols-7 gap-1 text-center mb-2">
                                            {DAYS.map((d, i) => (
                                                <span key={i} className="text-[10px] font-normal text-slate-400 uppercase tracking-widest">{d}</span>
                                            ))}
                                        </div>
                                        <div className="grid grid-cols-7 gap-1">
                                            {renderCalendar()}
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="py-4 space-y-6">
                                <h4 className="text-sm font-bold text-slate-900 dark:text-white text-center">When do you want to travel?</h4>
                                <div className="grid grid-cols-3 gap-2">
                                    {MONTHS.slice(0, 6).map(m => (
                                        <div key={m} className="p-3 rounded-xl border border-slate-200 dark:border-white/10 flex flex-col items-center gap-1 hover:border-blue-500 cursor-pointer group transition-all">
                                            <Calendar size={16} className="text-slate-400 group-hover:text-blue-500" />
                                            <div className="text-[10px] font-bold uppercase text-slate-700 dark:text-slate-300">{m}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Footer */}
                        <div className="flex justify-end mt-4 pt-3 border-t border-slate-100 dark:border-white/5">
                            <button
                                onClick={onClose}
                                className="px-6 py-1.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
