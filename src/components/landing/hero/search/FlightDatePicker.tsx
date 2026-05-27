"use client";

import React, { useRef, useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FlightDatePickerProps {
    date: Date | null;
    onChange: (date: Date | null) => void;
    label: string;
    description?: string;
    isOpen: boolean;
    onToggle: (isOpen: boolean) => void;
    minDate?: Date | null;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export const FlightDatePicker: React.FC<FlightDatePickerProps> = ({
    date,
    onChange,
    label,
    description = "Select Date",
    isOpen,
    onToggle,
    minDate
}) => {
    const ref = useRef<HTMLDivElement>(null);
    const [currentMonth, setCurrentMonth] = useState(date || new Date());
    const [view, setView] = useState<'calendar' | 'month' | 'year'>('calendar');
    const [yearInput, setYearInput] = useState(currentMonth.getFullYear().toString());

    useEffect(() => {
        setYearInput(currentMonth.getFullYear().toString());
    }, [currentMonth]);

    // Reset view when closed
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
        onChange(selectedDate);
    };

    const formatDate = (d: Date | null) => {
        if (!d) return <span className="text-slate-400 font-normal">{description}</span>;
        return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    };

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
            const isSelected = date && dateObj.toDateString() === date.toDateString();
            const isDisabled = isPast || (isBeforeMin && !isSelected);

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
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    className={cn(
                        "size-9 sm:size-10 mx-auto my-0.5 flex items-center justify-center text-[11px] sm:text-sm font-normal rounded-xl transition-all relative",
                        isDisabled
                            ? "text-slate-300 dark:text-slate-600 cursor-not-allowed opacity-20"
                            : "cursor-pointer hover:bg-slate-100 dark:hover:bg-white/5",
                        isSelected
                            ? "bg-blue-600 text-white z-10 shadow-lg shadow-blue-600/30"
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
                                    <div className="grid grid-cols-7 gap-1">
                                        {renderCalendar()}
                                    </div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="flex justify-end mt-4 pt-3 border-t border-slate-100 dark:border-white/5">
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onToggle(false);
                                    }}
                                    className="px-6 py-1.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-all shadow-lg"
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
