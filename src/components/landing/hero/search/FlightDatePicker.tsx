"use client";

import React, { useRef, useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslations, useLocale } from 'next-intl';

export interface FlightDateRange {
    startDate: Date | null;
    endDate: Date | null;
}

interface FlightDatePickerProps {
    date: Date | null;
    onChange: (date: Date | null) => void;
    label: string;
    description?: string;
    isOpen: boolean;
    onToggle: (isOpen: boolean) => void;
    minDate?: Date | null;
    /**
     * Round-trip mode: one calendar edits both legs, so opening "Depart" rolls
     * straight into picking the return without closing. `editing` is the leg the
     * trigger starts on — 'start' for the depart card, 'end' for the return card.
     */
    range?: {
        startDate: Date | null;
        endDate: Date | null;
        editing: 'start' | 'end';
        onChange: (range: FlightDateRange) => void;
    };
}

const isSameDay = (a: Date | null | undefined, b: Date | null | undefined) =>
    !!a && !!b && a.toDateString() === b.toDateString();

export const FlightDatePicker: React.FC<FlightDatePickerProps> = ({
    date,
    onChange,
    label,
    description,
    isOpen,
    onToggle,
    minDate,
    range
}) => {
    const t = useTranslations('landing.search');
    const locale = useLocale();
    const resolvedDescription = description ?? t('selectDate');
    const MONTHS = t.raw('months') as string[];
    const DAYS = t.raw('days') as string[];
    const ref = useRef<HTMLDivElement>(null);
    const [currentMonth, setCurrentMonth] = useState(date || range?.startDate || new Date());
    const [view, setView] = useState<'calendar' | 'month' | 'year'>('calendar');
    const [yearInput, setYearInput] = useState(currentMonth.getFullYear().toString());
    // Which leg the next click fills, in round-trip mode
    const [leg, setLeg] = useState<'start' | 'end'>(range?.editing ?? 'start');
    const [hoverDate, setHoverDate] = useState<Date | null>(null);

    const rangeStart = range?.startDate ?? null;
    const rangeEnd = range?.endDate ?? null;

    useEffect(() => {
        setYearInput(currentMonth.getFullYear().toString());
    }, [currentMonth]);

    // Reset view when closed; pick up the right leg and month when opened
    useEffect(() => {
        if (!isOpen) {
            setView('calendar');
            setHoverDate(null);
            return;
        }
        if (!range) return;
        // The return card can only edit the return once an outbound date exists
        const nextLeg: 'start' | 'end' = range.editing === 'end' && rangeStart ? 'end' : 'start';
        setLeg(nextLeg);
        const focus = nextLeg === 'end' ? (rangeEnd ?? rangeStart) : rangeStart;
        if (focus) setCurrentMonth(new Date(focus.getFullYear(), focus.getMonth(), 1));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent | TouchEvent) => {
            const target = e.target as Node;
            const trigger = ref.current?.parentElement?.querySelector('[data-datepicker-trigger]');
            const isInsideTrigger = trigger?.contains(target);
            const isOutside = ref.current && !ref.current.contains(target) && !isInsideTrigger;
            if (isOutside && document.contains(target)) {
                onToggle(false);
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
    }, [isOpen, onToggle]);

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

    const handleDateClick = (selectedDate: Date) => {
        if (!range) {
            onChange(selectedDate);
            return;
        }

        // A click fills the outbound leg when that's what we're editing, when
        // nothing is set yet, or when it lands before the current outbound —
        // that restarts the range instead of producing a return before depart.
        const startsNewRange = leg === 'start' || !rangeStart || selectedDate < rangeStart;

        if (startsNewRange) {
            const keepReturn = rangeEnd && rangeEnd >= selectedDate ? rangeEnd : null;
            range.onChange({ startDate: selectedDate, endDate: keepReturn });
            setLeg('end');
        } else {
            range.onChange({ startDate: rangeStart, endDate: selectedDate });
            setLeg('start');
        }
        setHoverDate(null);
    };

    const formatDate = (d: Date | null) => {
        if (!d) return <span className="text-slate-400 font-normal">{resolvedDescription}</span>;
        return d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
    };

    const formatLegDate = (d: Date | null) =>
        d ? d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' }) : resolvedDescription;

    // Tentative return highlighted while the cursor moves across the calendar
    const previewEnd = range && leg === 'end' && rangeStart && hoverDate && hoverDate > rangeStart
        ? hoverDate
        : null;
    const effectiveEnd = previewEnd ?? rangeEnd;

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
            const isBeforeMin = minDate ? dateObj < minDate : false;

            const isStart = range ? isSameDay(dateObj, rangeStart) : false;
            const isEnd = range ? isSameDay(dateObj, effectiveEnd) : false;
            const isInRange = !!(range && rangeStart && effectiveEnd && dateObj > rangeStart && dateObj < effectiveEnd);
            const isSelected = range
                ? (isStart || isEnd)
                : !!(date && dateObj.toDateString() === date.toDateString());
            // In range mode every future day stays clickable — picking an earlier
            // day restarts the range rather than being blocked by the outbound date.
            const isDisabled = range ? isPast : (isPast || (isBeforeMin && !isSelected));
            const isPreviewEnd = isEnd && !isSameDay(dateObj, rangeEnd);

            days.push(
                <button
                    key={day}
                    type="button"
                    disabled={isDisabled}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDateClick(dateObj);
                    }}
                    onMouseEnter={() => { if (!isDisabled) setHoverDate(dateObj); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    className={cn(
                        "size-9 sm:size-10 mx-auto my-0.5 flex items-center justify-center text-[11px] sm:text-sm font-normal rounded-xl transition-all relative",
                        isDisabled
                            ? "text-slate-300 dark:text-slate-600 cursor-not-allowed opacity-20"
                            : "cursor-pointer hover:bg-slate-100 dark:hover:bg-white/5",
                        isSelected
                            ? isPreviewEnd
                                ? "bg-blue-600/40 text-white z-10"
                                : "bg-blue-600 text-white z-10 shadow-lg shadow-blue-600/30"
                            : isInRange
                                ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                : "text-slate-700 dark:text-slate-300",
                        isToday && !isSelected && "ring-1 ring-blue-500/30",
                        isPast && !isSelected && "opacity-30"
                    )}
                >
                    {day}
                </button>
            );
        }
        return days;
    };

    return (
        <div className={`flex-1 min-w-0 relative h-16 group ${isOpen ? 'z-50' : 'z-auto'}`}>
            {/* Trigger */}
            <div
                className={`w-full h-full items-center px-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 transition-colors ${isOpen ? 'hidden sm:flex' : 'flex'}`}
                onClick={() => onToggle(!isOpen)}
                data-datepicker-trigger
            >
                <CalendarIcon className="text-slate-400 group-hover:text-blue-500 transition-colors shrink-0" size={20} />
                <div className="ml-3 flex flex-col justify-center w-full text-left min-w-0">
                    <label className="text-ui-label">
                        {label}
                    </label>
                    <div className="text-xs sm:text-sm font-normal text-blue-600 dark:text-blue-400 truncate">
                        {formatDate(date)}
                    </div>
                </div>
            </div>

            {/* Inline Expanding Calendar */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        ref={ref}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="relative sm:absolute top-0 sm:top-full left-0 sm:left-1/2 sm:-translate-x-1/2 sm:mt-4 w-full sm:w-[420px] bg-white dark:bg-obsidian shadow-2xl rounded-2xl border border-slate-200 dark:border-white/10 z-[100] overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                    >
                        <div className="p-4 flex flex-col relative">
                            {/* Depart / Return legs — round trip only */}
                            {range && (
                                <div className="flex items-stretch gap-2 mb-4">
                                    {(['start', 'end'] as const).map((which) => {
                                        const isActive = leg === which;
                                        const value = which === 'start' ? rangeStart : rangeEnd;
                                        return (
                                            <button
                                                key={which}
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setLeg(which);
                                                    if (value) setCurrentMonth(new Date(value.getFullYear(), value.getMonth(), 1));
                                                }}
                                                className={cn(
                                                    "flex-1 min-w-0 text-left px-3 py-2 rounded-xl border transition-all",
                                                    isActive
                                                        ? "border-blue-600 bg-blue-50/60 dark:border-blue-500/40 dark:bg-blue-500/10"
                                                        : "border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20"
                                                )}
                                            >
                                                <span className="block text-[10px] font-normal text-slate-400 uppercase tracking-widest">
                                                    {which === 'start' ? t('depart') : t('return')}
                                                </span>
                                                <span className={cn(
                                                    "block text-[11px] sm:text-sm font-normal truncate",
                                                    value ? "text-blue-600 dark:text-blue-400" : "text-slate-400"
                                                )}>
                                                    {formatLegDate(value)}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Header with month/year selectors */}
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
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onTouchStart={(e) => e.stopPropagation()}
                                        className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-colors"
                                    >
                                        <ChevronLeft size={16} className="text-slate-400" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleNextMonth}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onTouchStart={(e) => e.stopPropagation()}
                                        className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-colors"
                                    >
                                        <ChevronRight size={16} className="text-slate-400" />
                                    </button>
                                </div>
                            </div>

                            {/* Views */}
                            <div className="relative min-h-[220px]">
                                {/* Month Picker Overlay */}
                                {view === 'month' && (
                                    <div className="absolute inset-0 bg-white dark:bg-obsidian z-20 overflow-y-auto custom-scrollbar pr-1 animate-in fade-in zoom-in-95 duration-200">
                                        <div className="text-[10px] font-normal text-slate-400 uppercase tracking-widest mb-3 sticky top-0 bg-white dark:bg-obsidian py-1">{t('month')}</div>
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

                                {/* Year Picker Overlay */}
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

                                {/* Calendar View */}
                                <div className="animate-in fade-in duration-300">
                                    <div className="grid grid-cols-7 gap-1 text-center mb-2">
                                        {DAYS.map((d, i) => (
                                            <span key={i} className="text-[10px] font-normal text-slate-400 uppercase tracking-widest">{d}</span>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-7 gap-1" onMouseLeave={() => setHoverDate(null)}>
                                        {renderCalendar()}
                                    </div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="flex justify-between items-center gap-3 mt-4 pt-3 border-t border-slate-100 dark:border-white/5">
                                {range ? (
                                    <span className="text-[11px] font-normal text-slate-400 truncate">
                                        {leg === 'start' ? t('depart') : t('return')} · {resolvedDescription}
                                    </span>
                                ) : <span />}
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onToggle(false);
                                    }}
                                    className="px-6 py-1.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-all shadow-lg shrink-0"
                                >
                                    {t('done')}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
