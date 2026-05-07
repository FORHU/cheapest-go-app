import React, { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

interface FormDatePickerProps {
    value?: string; // YYYY-MM-DD
    onChange: (value: string) => void;
    placeholder?: string;
    required?: boolean;
    className?: string;
    minDate?: Date;
    maxDate?: Date;
}

export const FormDatePicker: React.FC<FormDatePickerProps> = ({
    value,
    onChange,
    placeholder = "Select date",
    required,
    className,
    minDate,
    maxDate
}) => {
    const [currentMonth, setCurrentMonth] = useState(() => {
        if (value) {
            const d = new Date(value);
            if (!isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), 1);
        }
        return new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    });

    const [view, setView] = useState<'calendar' | 'month' | 'year'>('calendar');
    const [yearInput, setYearInput] = useState(currentMonth.getFullYear().toString());

    useEffect(() => {
        setYearInput(currentMonth.getFullYear().toString());
    }, [currentMonth]);

    const selectedDate = useMemo(() => {
        if (!value) return null;
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
    }, [value]);

    const years = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const startYear = minDate ? minDate.getFullYear() : currentYear - 20;
        const endYear = maxDate ? maxDate.getFullYear() : currentYear + 20;
        const result = [];
        for (let i = startYear; i <= endYear; i++) {
            result.push(i);
        }
        return result;
    }, [minDate, maxDate]);

    const handlePrevMonth = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    };

    const handleNextMonth = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
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
            days.push(<div key={`pad-${i}`} className="size-8" />);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const isToday = date.toDateString() === today.toDateString();
            const isSelected = selectedDate && date.toDateString() === selectedDate.toDateString();
            
            const isDisabled = (minDate && date < minDate) || (maxDate && date > maxDate);

            days.push(
                <button
                    key={day}
                    type="button"
                    disabled={isDisabled}
                    onClick={(e) => {
                        e.stopPropagation();
                        const y = date.getFullYear();
                        const m = String(date.getMonth() + 1).padStart(2, '0');
                        const d = String(date.getDate()).padStart(2, '0');
                        onChange(`${y}-${m}-${d}`);
                    }}
                    className={cn(
                        "size-8 flex items-center justify-center text-[11px] font-normal rounded-md transition-all relative",
                        isDisabled 
                            ? "text-slate-300 dark:text-slate-600 cursor-not-allowed opacity-20" 
                            : "cursor-pointer hover:bg-slate-100 dark:hover:bg-white/5",
                        isSelected 
                            ? "bg-blue-600 text-white z-10 shadow-lg shadow-blue-600/30" 
                            : "text-slate-700 dark:text-slate-300",
                        isToday && !isSelected && "ring-1 ring-blue-500/30"
                    )}
                >
                    {day}
                </button>
            );
        }
        return days;
    };

    const displayValue = useMemo(() => {
        if (!selectedDate) return '';
        return selectedDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }, [selectedDate]);

    return (
        <DropdownMenu onOpenChange={(open) => { if (!open) setView('calendar'); }}>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        "w-full flex items-center justify-between px-2.5 lg:px-3 py-2 lg:py-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-[12px] lg:text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500/50 group text-left transition-all hover:border-blue-300 dark:hover:border-blue-500/50 shadow-sm",
                        !value && "text-slate-400",
                        className
                    )}
                >
                    <span>{displayValue || placeholder}</span>
                    <CalendarIcon size={16} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="p-0 overflow-hidden bg-white dark:bg-obsidian border-slate-200 dark:border-white/10 rounded-md shadow-2xl z-[1002] w-[var(--radix-dropdown-menu-trigger-width)] min-w-[280px]">
                <div className="p-4 flex flex-col relative">
                    {/* Header */}
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

                    {/* Footer Actions */}
                    <div className="flex gap-2 mt-6 pt-4 border-t border-slate-100 dark:border-white/5">
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                className="flex-1 py-2 rounded-md text-[12px] font-normal text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-all border border-slate-100 dark:border-white/5"
                            >
                                Cancel
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                className="flex-1 py-2 rounded-md text-[12px] font-normal text-white bg-blue-600 hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
                            >
                                Select
                            </button>
                        </DropdownMenuTrigger>
                    </div>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};


