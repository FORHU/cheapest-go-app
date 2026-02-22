"use client";

import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Calendar, ArrowRight } from 'lucide-react';
import { useSearchStore, useDates, useActiveDropdown } from '@/stores/searchStore';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

interface DatePickerProps {
    inline?: boolean;
    forceOpen?: boolean;
}

export const DatePicker: React.FC<DatePickerProps> = ({ inline, forceOpen }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [activeTab, setActiveTab] = useState<'calendar' | 'flexible'>('calendar');
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectingCheckOut, setSelectingCheckOut] = useState(false);

    // Store
    const activeDropdown = useActiveDropdown();
    const { checkIn, checkOut, flexibility } = useDates();
    const { setDates, setActiveDropdown } = useSearchStore();

    const isOpen = forceOpen || activeDropdown === 'dates';
    const onClose = () => {
        if (!forceOpen) setActiveDropdown(null);
    };

    // Close logic
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                onClose();
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const getNextMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 1);

    const handlePrevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    const handleNextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

    const handleDateClick = (date: Date) => {
        if (!selectingCheckOut || !checkIn || date < checkIn) {
            setDates({ checkIn: date, checkOut: null });
            setSelectingCheckOut(true);
        } else {
            setDates({ checkOut: date });
            setSelectingCheckOut(false);
            // Optional: Close on checkout selection? Usually user might want to review. 
            // We'll keep it open until "Done" is clicked or outside click.
        }
    };

    const flexOptions = ['Exact dates', '± 1 day', '± 2 days', '± 3 days', '± 7 days'];

    const onFlexibilityChange = (flex: string) => {
        // We need updates to store flexibility type
        type FlexType = 'exact' | '1day' | '2days' | '3days' | '7days';
        // Validate if it's one of the allowed types, usually we assume it is but strict typing is good
        if (['exact', '1day', '2days', '3days', '7days'].includes(flex)) {
            setDates({ flexibility: flex as FlexType });
        }
    };

    const renderMonth = (monthDate: Date) => {
        const year = monthDate.getFullYear();
        const month = monthDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const days = [];

        // Padding
        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`pad-${i}`} className={inline ? "w-full aspect-square" : "size-9"} />);
        }

        // Days
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const isToday = date.toDateString() === today.toDateString();
            const isPast = date < today;
            const isCheckIn = checkIn && date.toDateString() === checkIn.toDateString();
            const isCheckOut = checkOut && date.toDateString() === checkOut.toDateString();
            const isInRange = checkIn && checkOut && date > checkIn && date < checkOut;

            days.push(
                <button
                    key={day}
                    disabled={isPast}
                    onClick={() => handleDateClick(date)}
                    className={`${inline ? "w-full aspect-square" : "size-9"} flex items-center justify-center ${inline ? "text-[9px]" : "text-xs"} font-medium rounded-full transition-all
                        ${isPast ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed' : 'cursor-pointer'}
                        ${isCheckIn || isCheckOut ? 'bg-alabaster-accent dark:bg-obsidian-accent text-white dark:text-obsidian shadow-lg' : ''}
                        ${isInRange ? 'bg-alabaster-accent/10 dark:bg-obsidian-accent/10' : ''}
                        ${!isPast && !isCheckIn && !isCheckOut && !isInRange ? 'hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300' : ''}
                        ${isToday && !isCheckIn && !isCheckOut ? 'ring-1 ring-alabaster-accent dark:ring-obsidian-accent' : ''}
                    `}
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
                    initial={forceOpen ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={forceOpen ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className={inline
                        ? "w-full z-10"
                        : "absolute top-full left-0 mt-4 w-[650px] bg-white dark:bg-[#0f172a] shadow-2xl rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden z-50"}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Tabs */}
                    <div className={`flex border-b border-slate-100 dark:border-white/5 ${inline ? 'mb-0' : ''}`}>
                        <button
                            onClick={() => setActiveTab('calendar')}
                            className={`flex-1 ${inline ? 'py-2 text-[10px]' : 'py-4 text-xs'} font-bold font-display transition-all ${activeTab === 'calendar'
                                ? 'text-alabaster-accent dark:text-obsidian-accent border-b-2 border-alabaster-accent dark:border-obsidian-accent'
                                : 'text-slate-400 hover:text-slate-600'
                                }`}
                        >
                            Calendar
                        </button>
                        <button
                            onClick={() => setActiveTab('flexible')}
                            className={`flex-1 ${inline ? 'py-2 text-[10px]' : 'py-4 text-xs'} font-bold font-display transition-all ${activeTab === 'flexible'
                                ? 'text-alabaster-accent dark:text-obsidian-accent border-b-2 border-alabaster-accent dark:border-obsidian-accent'
                                : 'text-slate-400 hover:text-slate-600'
                                }`}
                        >
                            Flexible dates
                        </button>
                    </div>

                    <div className={inline ? "p-2" : "p-6"}>
                        {activeTab === 'calendar' ? (
                            <>
                                {/* Selected Dates Display */}
                                <div className={`flex items-center ${inline ? 'gap-3 mb-3' : 'gap-6 mb-8'}`}>
                                    <div className="flex-1 min-w-0">
                                        <span className={`${inline ? 'text-[7px]' : 'text-[10px]'} font-mono text-slate-400 uppercase mb-0.5 block`}>Check-in</span>
                                        <span className={`${inline ? 'text-[10px]' : 'text-sm sm:text-lg'} font-bold ${checkIn ? 'text-slate-900 dark:text-white' : 'text-slate-400'} truncate block`}>
                                            {formatDate(checkIn)}
                                        </span>
                                        <div className={`h-0.5 ${inline ? 'mt-1' : 'mt-2'} w-full ${checkIn ? 'bg-alabaster-accent dark:bg-obsidian-accent' : 'bg-slate-100 dark:bg-white/5'}`} />
                                    </div>
                                    <ArrowRight className="text-slate-300 shrink-0" size={inline ? 14 : 20} />
                                    <div className="flex-1 min-w-0">
                                        <span className={`${inline ? 'text-[7px]' : 'text-[10px]'} font-mono text-slate-400 uppercase mb-0.5 block`}>Check-out</span>
                                        <span className={`${inline ? 'text-[10px]' : 'text-sm sm:text-lg'} font-bold ${checkOut ? 'text-slate-900 dark:text-white' : 'text-slate-400'} truncate block`}>
                                            {formatDate(checkOut)}
                                        </span>
                                        <div className={`h-0.5 ${inline ? 'mt-1' : 'mt-2'} w-full ${checkOut ? 'bg-alabaster-accent dark:bg-obsidian-accent' : 'bg-slate-100 dark:bg-white/5'}`} />
                                    </div>
                                </div>

                                {/* Calendars */}
                                <div className={`flex gap-3 ${inline ? 'mb-3' : 'gap-6 mb-6'}`}>
                                    {/* Month 1 */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-center mb-3">
                                            <button onClick={handlePrevMonth} className="p-1 hover:bg-slate-100 dark:hover:bg-white/5 rounded">
                                                <ChevronLeft size={14} className="text-slate-400" />
                                            </button>
                                            <span className="text-[11px] font-bold text-slate-900 dark:text-white text-center">
                                                {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                                            </span>
                                            <div className="w-6" />
                                        </div>
                                        <div className="grid grid-cols-7 text-center mb-1.5 gap-0">
                                            {DAYS.map((d, i) => (
                                                <span key={i} className="text-[9px] font-mono text-slate-400 text-center">{d}</span>
                                            ))}
                                        </div>
                                        <div className="grid grid-cols-7 gap-0">
                                            {renderMonth(currentMonth)}
                                        </div>
                                    </div>

                                    {/* Divider */}
                                    <div className="w-px bg-slate-100 dark:bg-white/5 self-stretch" />

                                    {/* Month 2 */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-center mb-3">
                                            <div className="w-6" />
                                            <span className="text-[11px] font-bold text-slate-900 dark:text-white text-center">
                                                {MONTHS[getNextMonth(currentMonth).getMonth()]} {getNextMonth(currentMonth).getFullYear()}
                                            </span>
                                            <button onClick={handleNextMonth} className="p-1 hover:bg-slate-100 dark:hover:bg-white/5 rounded">
                                                <ChevronRight size={14} className="text-slate-400" />
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-7 text-center mb-1.5 gap-0">
                                            {DAYS.map((d, i) => (
                                                <span key={i} className="text-[9px] font-mono text-slate-400 text-center">{d}</span>
                                            ))}
                                        </div>
                                        <div className="grid grid-cols-7 gap-0">
                                            {renderMonth(getNextMonth(currentMonth))}
                                        </div>
                                    </div>
                                </div>

                                {/* Flexibility Pills */}
                                <div className="flex flex-wrap gap-2">
                                    {flexOptions.map(opt => (
                                        <button
                                            key={opt}
                                            onClick={() => onFlexibilityChange(opt)}
                                            className={`px-3 py-1 rounded-full border text-[10px] font-medium transition-all ${flexibility === opt
                                                ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-obsidian'
                                                : 'border-slate-200 dark:border-white/10 hover:border-slate-400 text-slate-600 dark:text-slate-400'
                                                }`}
                                        >
                                            {opt}
                                        </button>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="space-y-8">
                                <div className="text-center">
                                    <h4 className="text-lg font-bold mb-4 text-slate-900 dark:text-white">How long do you want to stay?</h4>
                                    <div className="flex flex-wrap justify-center gap-2">
                                        {['1 night', '2-3 nights', '4-5 nights', '6-7 nights'].map(p => (
                                            <button key={p} className="px-4 sm:px-6 py-2.5 rounded-full border text-xs font-bold border-slate-200 dark:border-white/10 hover:border-alabaster-accent dark:hover:border-obsidian-accent transition-colors text-slate-700 dark:text-slate-300">
                                                {p}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <h4 className="text-lg font-bold mb-4 text-center text-slate-900 dark:text-white">When do you want to travel?</h4>
                                    <div className={`grid gap-3 ${inline ? 'grid-cols-3' : 'grid-cols-6'}`}>
                                        {MONTHS.slice(0, 6).map(m => (
                                            <div key={m} className="p-4 rounded-xl border border-slate-200 dark:border-white/10 flex flex-col items-center gap-2 hover:border-alabaster-accent dark:hover:border-obsidian-accent cursor-pointer group transition-all">
                                                <Calendar size={20} className="text-slate-400 group-hover:text-alabaster-accent dark:group-hover:text-obsidian-accent" />
                                                <div className="text-[10px] font-bold uppercase text-slate-700 dark:text-slate-300">{m}</div>
                                                <div className="text-[8px] font-mono text-slate-400">2026</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    {!inline && (
                        <div className="flex justify-end p-4 border-t border-slate-100 dark:border-white/5">
                            <button
                                onClick={onClose}
                                className="px-8 py-2.5 bg-alabaster-accent dark:bg-obsidian-accent text-white dark:text-obsidian rounded-full font-bold text-sm hover:opacity-90 transition-all shadow-lg"
                            >
                                Done
                            </button>
                        </div>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
};
