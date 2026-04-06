"use client";

import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

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

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent | TouchEvent) => {
            const target = e.target as Node;
            // Ensure the target is not part of the trigger element to avoid double-toggling
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

    const getNextMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 1);
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
        onToggle(false);
    };

    const formatDate = (date: Date | null) => {
        if (!date) return <span className="text-slate-400 font-normal">{description}</span>;
        return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    };

    const renderMonth = (monthDate: Date) => {
        const year = monthDate.getFullYear();
        const month = monthDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const days = [];
        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`pad-${i}`} className="size-8" />);
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
                    className={`size-10 flex items-center justify-center text-sm font-medium rounded-full transition-all relative
                        ${isDisabled ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed opacity-20' : 'cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10'}
                        ${isSelected ? 'bg-blue-600 text-white shadow-lg z-10 scale-110' : 'text-slate-700 dark:text-slate-300'}
                        ${isToday && !isSelected ? 'ring-1 ring-blue-600/50' : ''}
                        ${isPast && !isSelected ? 'line-through decoration-slate-400/30' : ''}
                    `}
                >
                    {day}
                </button>

            );
        }
        return days;
    };

    return (
        <div className={`flex-1 min-w-0 relative h-16 group ${isOpen ? 'z-50' : 'z-auto'}`}>
            <div
                className="w-full h-full flex items-center px-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                onClick={() => onToggle(!isOpen)}
                data-datepicker-trigger
            >
                <CalendarIcon className="text-slate-400 group-hover:text-blue-500 transition-colors shrink-0" size={20} />
                <div className="ml-3 flex flex-col justify-center w-full text-left min-w-0">
                    <label className="text-[11px] uppercase font-mono text-slate-500 font-bold tracking-wider">
                        {label}
                    </label>
                    <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {formatDate(date)}
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        ref={ref}
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="absolute top-full left-1/2 -translate-x-1/2 sm:translate-x-0 sm:left-0 mt-4 w-[calc(100vw-32px)] sm:w-[580px] sm:min-w-[580px] sm:max-w-[580px] bg-white dark:bg-slate-900 shadow-2xl rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden z-[100]"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                    >
                        <div className="p-5">
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <div className="flex justify-between items-center mb-6">
                                        <button
                                            type="button"
                                            onClick={handlePrevMonth}
                                            className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors"
                                        >
                                            <ChevronLeft size={20} className="text-slate-500 dark:text-slate-400" />
                                        </button>
                                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                                            {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={handleNextMonth}
                                            className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full sm:hidden transition-colors"
                                        >
                                            <ChevronRight size={20} className="text-slate-500 dark:text-slate-400" />
                                        </button>

                                        <div className="w-10 hidden sm:block" />
                                    </div>
                                    <div className="grid grid-cols-7 gap-1 text-center mb-3">
                                        {DAYS.map((d, i) => (
                                            <span key={i} className="text-xs font-mono text-slate-400 font-bold">{d}</span>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-7 gap-1">
                                        {renderMonth(currentMonth)}
                                    </div>
                                </div>

                                <div className="flex-1 hidden sm:block pl-6 border-l border-slate-100 dark:border-white/5">
                                    <div className="flex justify-between items-center mb-6">
                                        <div className="w-10" />
                                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                                            {MONTHS[getNextMonth(currentMonth).getMonth()]} {getNextMonth(currentMonth).getFullYear()}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={handleNextMonth}
                                            className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors"
                                        >
                                            <ChevronRight size={20} className="text-slate-500 dark:text-slate-400" />
                                        </button>

                                    </div>
                                    <div className="grid grid-cols-7 gap-1 text-center mb-3">
                                        {DAYS.map((d, i) => (
                                            <span key={i} className="text-xs font-mono text-slate-400 font-bold">{d}</span>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-7 gap-1">
                                        {renderMonth(getNextMonth(currentMonth))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex justify-end p-4 border-t border-slate-100 dark:border-white/5">
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onToggle(false);
                                }}
                                className="px-8 py-2 bg-blue-600 text-white rounded-full font-bold text-sm hover:bg-blue-700 transition-all shadow-lg"
                            >
                                Done
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
