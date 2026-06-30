"use client";

import React, { useRef, useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Minus, Plus, ChevronDown, X, Users } from 'lucide-react';
import { useSearchStore, useTravelers, useActiveDropdown, RoomOccupancy } from '@/stores/searchStore';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTranslations } from 'next-intl';

interface CounterProps {
    label: string;
    sublabel?: string;
    value: number;
    min: number;
    max: number;
    onChange: (value: number) => void;
}

const Counter: React.FC<CounterProps> = ({ label, sublabel, value, min, max, onChange }) => (
    <div className="flex justify-between items-center py-2.5">
        <div className="text-left">
            <span className="text-xs font-bold text-slate-900 dark:text-white block">{label}</span>
            {sublabel && <span className="text-[9px] font-mono text-slate-400">{sublabel}</span>}
        </div>
        <div className="flex items-center gap-3">
            <button
                disabled={value <= min}
                onClick={(e) => { e.stopPropagation(); onChange(value - 1); }}
                onMouseDown={(e) => e.stopPropagation()}
                className="size-7 rounded-full border border-slate-200 dark:border-white/20 flex items-center justify-center text-slate-500 hover:border-blue-500 hover:text-blue-500 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
            >
                <Minus size={14} />
            </button>
            <span className="w-4 text-center font-mono font-bold text-xs text-slate-900 dark:text-white">
                {value}
            </span>
            <button
                disabled={value >= max}
                onClick={(e) => { e.stopPropagation(); onChange(value + 1); }}
                onMouseDown={(e) => e.stopPropagation()}
                className="size-7 rounded-full border border-slate-200 dark:border-white/20 flex items-center justify-center text-slate-500 hover:border-blue-500 hover:text-blue-500 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
            >
                <Plus size={14} />
            </button>
        </div>
    </div>
);

/** Age selector dropdown for a child */
const ChildAgeSelector: React.FC<{
    age: number;
    index: number;
    onAgeChange: (index: number, age: number) => void;
    onRemove: (index: number) => void;
}> = ({ age, index, onAgeChange, onRemove }) => {
    const t = useTranslations('landing.search');
    return (
        <div className="flex items-center gap-1.5">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        className="flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-[10px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                        <span>{t('childLabel', { index: index + 1, age })}</span>
                        <ChevronDown size={10} className="text-slate-400" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="rounded-xl min-w-[100px] max-h-48 overflow-y-auto thin-scrollbar">
                    {Array.from({ length: 18 }, (_, i) => (
                        <DropdownMenuItem
                            key={i}
                            onClick={() => onAgeChange(index, i)}
                            className={cn(
                                "text-[11px] font-semibold py-1.5",
                                age === i ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20" : "text-slate-700 dark:text-slate-300"
                            )}
                        >
                            {t('yearsOld', { age: i })}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
            <button
                onClick={() => onRemove(index)}
                className="p-1 text-slate-400 hover:text-red-500 transition-colors"
            >
                <X size={12} />
            </button>
        </div>
    );
};

interface TravelersPickerProps {
    inline?: boolean;
    forceOpen?: boolean;
}

export const TravelersPicker: React.FC<TravelersPickerProps> = ({ inline, forceOpen }) => {
    const ref = useRef<HTMLDivElement>(null);

    // Store
    const activeDropdown = useActiveDropdown();
    const { adults, children, occupancies } = useTravelers();
    const { setTravelers, setActiveDropdown } = useSearchStore();

    // Local state for children ages (default to age 10 for new children)
    const [childrenAges, setChildrenAges] = useState<number[]>(
        occupancies?.[0]?.childrenAges || Array(children).fill(10)
    );

    // Sync children count with ages array
    useEffect(() => {
        if (children > childrenAges.length) {
            setChildrenAges(prev => [...prev, ...Array(children - prev.length).fill(10)]);
        } else if (children < childrenAges.length) {
            setChildrenAges(prev => prev.slice(0, children));
        }
    }, [children, childrenAges.length]);

    // Update store when ages change — always 1 room
    useEffect(() => {
        setTravelers({
            rooms: 1,
            occupancies: [{ adults, childrenAges }],
        });
    }, [adults, childrenAges, setTravelers]);

    const isOpen = forceOpen || activeDropdown === 'travelers';
    const onClose = () => {
        if (!forceOpen) setActiveDropdown(null);
    };

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent | TouchEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
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

    const handleChildAgeChange = (index: number, age: number) => {
        setChildrenAges(prev => {
            const newAges = [...prev];
            newAges[index] = age;
            return newAges;
        });
    };

    const handleRemoveChild = (index: number) => {
        setChildrenAges(prev => prev.filter((_, i) => i !== index));
        setTravelers({ children: children - 1 });
    };

    const handleAddChild = () => {
        if (children < 6) {
            setTravelers({ children: children + 1 });
        }
    };

    const t = useTranslations('landing.search');

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    ref={ref}
                    initial={forceOpen ? { opacity: 1, height: 'auto' } : { opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={forceOpen ? { opacity: 1, height: 'auto' } : { opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className={inline
                        ? "w-full z-10"
                        : "relative sm:absolute top-0 sm:top-full left-0 sm:left-auto sm:right-0 sm:mt-4 w-full sm:w-[500px] bg-white dark:bg-obsidian shadow-2xl rounded-2xl border border-slate-200 dark:border-white/10 z-[100]"}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                >
                    <div className={inline ? "p-2" : "p-6"}>
                        {!forceOpen && (
                            <h4 className="text-xs font-mono uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2">
                                <Users size={12} /> {t('guestsRooms')}
                            </h4>
                        )}

                        <div className="divide-y divide-slate-100 dark:divide-white/5">
                            <Counter
                                label={t('adults')}
                                value={adults}
                                min={1}
                                max={10}
                                onChange={(val) => setTravelers({ adults: val })}
                            />

                            {/* Children row */}
                            <div className="flex justify-between items-center py-2.5">
                                <div className="text-left">
                                    <span className="text-xs font-bold text-slate-900 dark:text-white block">{t('children')}</span>
                                    <span className="text-[9px] font-mono text-slate-400">{t('childrenAges')}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        disabled={children <= 0}
                                        onClick={(e) => { e.stopPropagation(); setTravelers({ children: children - 1 }); }}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        className="size-7 rounded-full border border-slate-200 dark:border-white/20 flex items-center justify-center text-slate-500 hover:border-blue-500 hover:text-blue-500 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                                    >
                                        <Minus size={14} />
                                    </button>
                                    <span className="w-4 text-center font-mono font-bold text-xs text-slate-900 dark:text-white">
                                        {children}
                                    </span>
                                    <button
                                        disabled={children >= 6}
                                        onClick={(e) => { e.stopPropagation(); handleAddChild(); }}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        className="size-7 rounded-full border border-slate-200 dark:border-white/20 flex items-center justify-center text-slate-500 hover:border-blue-500 hover:text-blue-500 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                                    >
                                        <Plus size={14} />
                                    </button>
                                </div>
                            </div>

                            {/* Children age selectors */}
                            {childrenAges.length > 0 && (
                                <div className="py-2.5 flex flex-wrap gap-2">
                                    {childrenAges.map((age, index) => (
                                        <ChildAgeSelector
                                            key={index}
                                            age={age}
                                            index={index}
                                            onAgeChange={handleChildAgeChange}
                                            onRemove={handleRemoveChild}
                                        />
                                    ))}
                                </div>
                            )}

                            {/* Rooms — locked to 1 */}
                            <div className="flex justify-between items-center py-2.5">
                                <div className="text-left">
                                    <span className="text-xs font-bold text-slate-900 dark:text-white block">{t('rooms')}</span>
                                    <span className="text-[9px] font-mono text-slate-400">{t('roomsNote')}</span>
                                </div>
                                <span className="font-mono font-bold text-xs text-slate-900 dark:text-white pr-1">1</span>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    {!inline && (
                        <div className="flex flex-col gap-3 p-6 border-t border-slate-100 dark:border-white/5">
                            <button
                                onMouseDown={(e) => { e.stopPropagation(); onClose(); }}
                                onTouchStart={(e) => { e.stopPropagation(); onClose(); }}
                                className="w-full py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/25"
                            >
                                {t('done')}
                            </button>
                        </div>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
};
