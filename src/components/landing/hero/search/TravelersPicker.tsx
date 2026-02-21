"use client";

import React, { useRef, useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Minus, Plus, ChevronDown, X } from 'lucide-react';
import { useSearchStore, useTravelers, useActiveDropdown, RoomOccupancy } from '@/stores/searchStore';

interface CounterProps {
    label: string;
    sublabel?: string;
    value: number;
    min: number;
    max: number;
    onChange: (value: number) => void;
}

const Counter: React.FC<CounterProps> = ({ label, sublabel, value, min, max, onChange }) => (
    <div className="flex justify-between items-center py-2">
        <div>
            <span className="text-[11px] font-normal text-slate-900 dark:text-white block">{label}</span>
            {sublabel && <span className="text-[9px] font-normal text-slate-400">{sublabel}</span>}
        </div>
        <div className="flex items-center gap-2">
            <button
                disabled={value <= min}
                onClick={() => onChange(value - 1)}
                className="size-7 rounded-full border border-slate-200 dark:border-white/20 flex items-center justify-center text-slate-500 hover:border-alabaster-accent dark:hover:border-obsidian-accent hover:text-alabaster-accent dark:hover:text-obsidian-accent transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
            >
                <Minus size={12} />
            </button>
            <span className="w-4 text-center font-normal text-[11px] text-slate-900 dark:text-white">
                {value}
            </span>
            <button
                disabled={value >= max}
                onClick={() => onChange(value + 1)}
                className="size-7 rounded-full border border-slate-200 dark:border-white/20 flex items-center justify-center text-slate-500 hover:border-alabaster-accent dark:hover:border-obsidian-accent hover:text-alabaster-accent dark:hover:text-obsidian-accent transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
            >
                <Plus size={12} />
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
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    return (
        <div className="flex items-center gap-1.5" ref={dropdownRef}>
            <div className="relative">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                    <span>Child {index + 1}: {age} yrs</span>
                    <ChevronDown size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-20 max-h-40 overflow-y-auto min-w-[100px]"
                        >
                            {Array.from({ length: 18 }, (_, i) => (
                                <button
                                    key={i}
                                    onClick={() => {
                                        onAgeChange(index, i);
                                        setIsOpen(false);
                                    }}
                                    className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-700 ${age === i ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`}
                                >
                                    {i} years
                                </button>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            <button
                onClick={() => onRemove(index)}
                className="p-0.5 text-slate-400 hover:text-red-500 transition-colors"
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
    const { adults, children, rooms, occupancies } = useTravelers();
    const { setTravelers, setActiveDropdown } = useSearchStore();

    // Local state for children ages (default to age 10 for new children)
    const [childrenAges, setChildrenAges] = useState<number[]>(
        occupancies?.[0]?.childrenAges || Array(children).fill(10)
    );

    // Sync children count with ages array
    useEffect(() => {
        if (children > childrenAges.length) {
            // Add new children with default age 10
            setChildrenAges(prev => [...prev, ...Array(children - prev.length).fill(10)]);
        } else if (children < childrenAges.length) {
            // Remove extra children
            setChildrenAges(prev => prev.slice(0, children));
        }
    }, [children, childrenAges.length]);

    // Update store when ages change
    useEffect(() => {
        const newOccupancies: RoomOccupancy[] = [];

        // Distribute adults and children across rooms
        const adultsPerRoom = Math.ceil(adults / rooms);
        const childrenPerRoom = Math.ceil(childrenAges.length / rooms);

        let remainingAdults = adults;
        let remainingChildren = [...childrenAges];

        for (let i = 0; i < rooms; i++) {
            const roomAdults = Math.min(adultsPerRoom, remainingAdults);
            remainingAdults -= roomAdults;

            const roomChildrenCount = Math.min(childrenPerRoom, remainingChildren.length);
            const roomChildrenAges = remainingChildren.splice(0, roomChildrenCount);

            newOccupancies.push({
                adults: roomAdults || 1,
                childrenAges: roomChildrenAges
            });
        }

        setTravelers({ occupancies: newOccupancies });
    }, [adults, rooms, childrenAges, setTravelers]);

    const isOpen = forceOpen || activeDropdown === 'travelers';
    const onClose = () => {
        if (!forceOpen) setActiveDropdown(null);
    };

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

    // Summary text for display
    const summaryText = useMemo(() => {
        const parts = [];
        parts.push(`${adults} adult${adults !== 1 ? 's' : ''}`);
        if (children > 0) {
            parts.push(`${children} child${children !== 1 ? 'ren' : ''}`);
        }
        parts.push(`${rooms} room${rooms !== 1 ? 's' : ''}`);
        return parts.join(', ');
    }, [adults, children, rooms]);

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
                        : "absolute top-full right-0 mt-4 w-[340px] bg-white dark:bg-[#0f172a] shadow-2xl rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden z-50"}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className={inline ? "p-2" : "p-5"}>
                        {!forceOpen && (
                            <h4 className="text-xs font-mono uppercase tracking-widest text-slate-400 mb-2">
                                Guests & Rooms
                            </h4>
                        )}

                        <div className="divide-y divide-slate-100 dark:divide-white/5">
                            <Counter
                                label="Adults"
                                value={adults}
                                min={1}
                                max={10}
                                onChange={(val) => setTravelers({ adults: val })}
                            />
                            <div className="py-3">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <span className="text-[11px] font-normal text-slate-900 dark:text-white block">Children</span>
                                        <span className="text-[9px] font-normal text-slate-400">Ages 0 to 17</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            disabled={children <= 0}
                                            onClick={() => setTravelers({ children: children - 1 })}
                                            className="size-7 rounded-full border border-slate-200 dark:border-white/20 flex items-center justify-center text-slate-500 hover:border-alabaster-accent dark:hover:border-obsidian-accent hover:text-alabaster-accent dark:hover:text-obsidian-accent transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                                        >
                                            <Minus size={12} />
                                        </button>
                                        <span className="w-4 text-center font-normal text-[11px] text-slate-900 dark:text-white">
                                            {children}
                                        </span>
                                        <button
                                            disabled={children >= 6}
                                            onClick={handleAddChild}
                                            className="size-7 rounded-full border border-slate-200 dark:border-white/20 flex items-center justify-center text-slate-500 hover:border-alabaster-accent dark:hover:border-obsidian-accent hover:text-alabaster-accent dark:hover:text-obsidian-accent transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                                        >
                                            <Plus size={12} />
                                        </button>
                                    </div>
                                </div>

                                {/* Children age selectors */}
                                {childrenAges.length > 0 && (
                                    <div className="mt-3 flex flex-wrap gap-2">
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
                            </div>
                            <Counter
                                label="Rooms"
                                value={rooms}
                                min={1}
                                max={8}
                                onChange={(val) => setTravelers({ rooms: val })}
                            />
                        </div>

                        {/* Summary */}
                        <div className="mt-3 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                            <p className="text-[10px] font-normal text-slate-500 dark:text-slate-400">
                                {summaryText}
                            </p>
                        </div>
                    </div>

                    {/* Footer */}
                    {!inline && (
                        <div className="flex flex-col gap-3 p-4 border-t border-slate-100 dark:border-white/5">
                            <button
                                onClick={onClose}
                                className="w-full py-3 bg-alabaster-accent dark:bg-obsidian-accent text-white dark:text-obsidian rounded-xl font-bold text-sm hover:opacity-90 transition-all"
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
