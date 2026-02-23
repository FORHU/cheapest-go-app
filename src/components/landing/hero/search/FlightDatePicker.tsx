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
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                onToggle(false);
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onToggle]);

    const getNextMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const handlePrevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    const handleNextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

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
                    disabled={isDisabled}
                    onClick={() => handleDateClick(dateObj)}
                    className={`size-8 flex items-center justify-center text-xs font-medium rounded-full transition-all
                        ${isDisabled ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-100 dark:hover:bg-white/5'}
                        ${isSelected ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-700 dark:text-slate-300'}
                        ${isToday && !isSelected ? 'ring-1 ring-blue-600/50' : ''}
                    `}
                >
                    {day}
                </button>
            );
        }
        return days;
    };

    return (
        <div
            className="flex-1 min-w-0 relative flex items-center px-4 h-16 group cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
            onClick={() => onToggle(!isOpen)}
        >
            <CalendarIcon className="text-slate-400 group-hover:text-blue-500 transition-colors shrink-0" size={20} />
            <div className="ml-3 flex flex-col justify-center w-full text-left min-w-0">
                <label className="text-[9px] uppercase font-mono text-slate-500 font-medium tracking-wider">
                    {label}
                </label>
                <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {formatDate(date)}
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
                        className="absolute top-full left-1/2 -translate-x-1/2 sm:translate-x-0 sm:left-0 mt-4 w-[calc(100vw-32px)] sm:w-[500px] sm:min-w-[500px] sm:max-w-[500px] bg-white dark:bg-[#0f172a] shadow-2xl rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden z-[100]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-5">
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <div className="flex justify-between items-center mb-4">
                                        <button onClick={handlePrevMonth} className="p-1 hover:bg-slate-100 dark:hover:bg-white/5 rounded">
                                            <ChevronLeft size={16} className="text-slate-400" />
                                        </button>
                                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                                            {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                                        </span>
                                        <button onClick={handleNextMonth} className="p-1 hover:bg-slate-100 dark:hover:bg-white/5 rounded sm:hidden">
                                            <ChevronRight size={16} className="text-slate-400" />
                                        </button>
                                        <div className="w-6 hidden sm:block" />
                                    </div>
                                    <div className="grid grid-cols-7 gap-1 text-center mb-2">
                                        {DAYS.map((d, i) => (
                                            <span key={i} className="text-[10px] font-mono text-slate-400">{d}</span>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-7 gap-1">
                                        {renderMonth(currentMonth)}
                                    </div>
                                </div>

                                <div className="flex-1 hidden sm:block">
                                    <div className="flex justify-between items-center mb-4">
                                        <div className="w-6" />
                                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                                            {MONTHS[getNextMonth(currentMonth).getMonth()]} {getNextMonth(currentMonth).getFullYear()}
                                        </span>
                                        <button onClick={handleNextMonth} className="p-1 hover:bg-slate-100 dark:hover:bg-white/5 rounded">
                                            <ChevronRight size={16} className="text-slate-400" />
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-7 gap-1 text-center mb-2">
                                        {DAYS.map((d, i) => (
                                            <span key={i} className="text-[10px] font-mono text-slate-400">{d}</span>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-7 gap-1">
                                        {renderMonth(getNextMonth(currentMonth))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
