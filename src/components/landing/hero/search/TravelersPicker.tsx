"use client";

import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Minus, Plus } from 'lucide-react';

interface TravelersPickerProps {
    isOpen: boolean;
    adults: number;
    children: number;
    rooms: number;
    onAdultsChange: (count: number) => void;
    onChildrenChange: (count: number) => void;
    onRoomsChange: (count: number) => void;
    onClose: () => void;
}

interface CounterProps {
    label: string;
    sublabel?: string;
    value: number;
    min: number;
    max: number;
    onChange: (value: number) => void;
}

const Counter: React.FC<CounterProps> = ({ label, sublabel, value, min, max, onChange }) => (
    <div className="flex justify-between items-center py-4">
        <div>
            <span className="text-sm font-bold text-slate-900 dark:text-white block">{label}</span>
            {sublabel && <span className="text-[10px] font-mono text-slate-400">{sublabel}</span>}
        </div>
        <div className="flex items-center gap-4">
            <button
                disabled={value <= min}
                onClick={() => onChange(value - 1)}
                className="size-8 rounded-full border border-slate-200 dark:border-white/20 flex items-center justify-center text-slate-500 hover:border-alabaster-accent dark:hover:border-obsidian-accent hover:text-alabaster-accent dark:hover:text-obsidian-accent transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
            >
                <Minus size={16} />
            </button>
            <span className="w-6 text-center font-mono font-bold text-lg text-slate-900 dark:text-white">
                {value}
            </span>
            <button
                disabled={value >= max}
                onClick={() => onChange(value + 1)}
                className="size-8 rounded-full border border-slate-200 dark:border-white/20 flex items-center justify-center text-slate-500 hover:border-alabaster-accent dark:hover:border-obsidian-accent hover:text-alabaster-accent dark:hover:text-obsidian-accent transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
            >
                <Plus size={16} />
            </button>
        </div>
    </div>
);

export const TravelersPicker: React.FC<TravelersPickerProps> = ({
    isOpen,
    adults,
    children,
    rooms,
    onAdultsChange,
    onChildrenChange,
    onRoomsChange,
    onClose,
}) => {
    const ref = useRef<HTMLDivElement>(null);

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
    }, [isOpen, onClose]);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    ref={ref}
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="absolute top-full right-0 mt-4 w-[320px] bg-white dark:bg-[#0f172a] shadow-2xl rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden z-50"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="p-6">
                        <h4 className="text-xs font-mono uppercase tracking-widest text-slate-400 mb-2">
                            Room 1 Configuration
                        </h4>

                        <div className="divide-y divide-slate-100 dark:divide-white/5">
                            <Counter
                                label="Adults"
                                value={adults}
                                min={1}
                                max={10}
                                onChange={onAdultsChange}
                            />
                            <Counter
                                label="Children"
                                sublabel="Ages 0 to 17"
                                value={children}
                                min={0}
                                max={6}
                                onChange={onChildrenChange}
                            />
                            <Counter
                                label="Rooms"
                                value={rooms}
                                min={1}
                                max={8}
                                onChange={onRoomsChange}
                            />
                        </div>

                        <button className="text-xs font-bold text-alabaster-accent dark:text-obsidian-accent hover:underline mt-4 block">
                            Add another room
                        </button>
                    </div>

                    {/* Footer */}
                    <div className="flex flex-col gap-3 p-4 border-t border-slate-100 dark:border-white/5">
                        <button
                            onClick={onClose}
                            className="w-full py-3 bg-alabaster-accent dark:bg-obsidian-accent text-white dark:text-obsidian rounded-xl font-bold text-sm hover:opacity-90 transition-all"
                        >
                            Done
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
