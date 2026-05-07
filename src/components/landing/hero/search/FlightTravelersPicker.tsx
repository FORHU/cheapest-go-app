"use client";

import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Minus, Plus, Users, Crown, ChevronDown } from 'lucide-react';
import { FlightState } from '@/stores/searchStore';

interface FlightTravelersPickerProps {
    passengers: FlightState['passengers'];
    cabinClass: FlightState['cabinClass'];
    onChangePassengers: (passengers: Partial<FlightState['passengers']>) => void;
    onChangeCabin: (cabin: FlightState['cabinClass']) => void;
    isOpen: boolean;
    onToggle: (isOpen: boolean) => void;
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
    <div className="flex justify-between items-center py-2.5">
        <div>
            <span className="text-xs font-bold text-slate-900 dark:text-white block">{label}</span>
            {sublabel && <span className="text-[9px] font-mono text-slate-400">{sublabel}</span>}
        </div>
        <div className="flex items-center gap-3">
            <button
                disabled={value <= min}
                onClick={(e) => { e.stopPropagation(); onChange(value - 1); }}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
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
                onTouchStart={(e) => e.stopPropagation()}
                className="size-7 rounded-full border border-slate-200 dark:border-white/20 flex items-center justify-center text-slate-500 hover:border-blue-500 hover:text-blue-500 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
            >
                <Plus size={14} />
            </button>
        </div>
    </div>
);

export const FlightTravelersPicker: React.FC<FlightTravelersPickerProps> = ({
    passengers,
    cabinClass,
    onChangePassengers,
    onChangeCabin,
    isOpen,
    onToggle,
}) => {
    const ref = useRef<HTMLDivElement>(null);

    // Close logic
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent | TouchEvent) => {
            const target = e.target as Node;
            // Ensure the target is not part of the trigger element to avoid double-toggling
            const trigger = ref.current?.parentElement?.querySelector('[data-travelers-trigger]');
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

    const cabinClasses = [
        { value: 'economy', label: 'Economy' },
        { value: 'premium_economy', label: 'Premium Economy' },
        { value: 'business', label: 'Business' },
        { value: 'first', label: 'First Class' },
    ];

    const totalPassengers = passengers.adults + passengers.children + passengers.infants;

    return (
        <div className="flex-1 min-w-0 relative">
            <div
                className={`flex-1 min-w-0 relative flex items-center px-4 h-16 group cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 transition-colors ${isOpen ? 'hidden sm:flex' : 'flex'}`}
                onClick={() => onToggle(!isOpen)}
                data-travelers-trigger
            >
                <Users className="text-slate-400 group-hover:text-blue-500 transition-colors shrink-0" size={20} />
                <div className="ml-3 flex flex-col justify-center w-full text-left min-w-0">
                    <label className="text-ui-label">
                        Travelers
                    </label>
                    <div className="text-ui-value truncate pr-6">
                        {totalPassengers} {totalPassengers === 1 ? 'Guest' : 'Guests'}
                        <span className="text-slate-400 font-normal mx-1">•</span>
                        <span className="text-fluid-3xs font-medium capitalize text-slate-500 dark:text-slate-400">
                            {cabinClass.replace('_', ' ')}
                        </span>
                    </div>
                </div>
            </div>



            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        ref={ref}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="relative sm:absolute top-0 sm:top-full left-0 sm:left-auto sm:right-0 sm:mt-4 w-full sm:w-[500px] bg-white dark:bg-[#0f172a] shadow-2xl rounded-2xl border border-slate-200 dark:border-white/10 z-[100]"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                    >
                        <div className="p-6">
                            {/* Cabin Class Selection */}
                            <div className="mb-4">
                                <h4 className="text-xs font-mono uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2">
                                    <Crown size={12} /> Cabin Class
                                </h4>
                                <div className="grid grid-cols-2 gap-2">
                                    {cabinClasses.map((c) => (
                                        <button
                                            key={c.value}
                                            onClick={(e) => { e.stopPropagation(); onChangeCabin(c.value as any); }}
                                            onMouseDown={(e) => e.stopPropagation()}
                                            onTouchStart={(e) => e.stopPropagation()}
                                            className={`px-3 py-2 text-xs font-medium rounded-lg border transition-all ${cabinClass === c.value
                                                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                                                : 'border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5'
                                                }`}
                                        >
                                            {c.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="h-px bg-slate-100 dark:bg-white/5 my-3" />

                            <h4 className="text-xs font-mono uppercase tracking-widest text-slate-400 mb-2">
                                Passengers
                            </h4>
                            <div className="divide-y divide-slate-100 dark:divide-white/5">
                                <Counter
                                    label="Adults"
                                    sublabel="Age 12+"
                                    value={passengers.adults}
                                    min={1}
                                    max={9}
                                    onChange={(val) => onChangePassengers({ adults: val })}
                                />
                                <Counter
                                    label="Children"
                                    sublabel="Age 2-11"
                                    value={passengers.children}
                                    min={0}
                                    max={9}
                                    onChange={(val) => onChangePassengers({ children: val })}
                                />
                                <Counter
                                    label="Infants"
                                    sublabel="Under 2 (lap)"
                                    value={passengers.infants}
                                    min={0}
                                    max={passengers.adults} // Usually 1 infant per adult allowed on lap
                                    onChange={(val) => onChangePassengers({ infants: val })}
                                />
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex flex-col gap-3 p-6 border-t border-slate-100 dark:border-white/5">
                            <button
                                onMouseDown={(e) => { e.stopPropagation(); onToggle(false); }}
                                onTouchStart={(e) => { e.stopPropagation(); onToggle(false); }}
                                className="w-full py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/25"
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
