"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { useFlightSearch } from '@/hooks/search/useFlightSearch';

export const TripTypeSelector = () => {
    const { flightState, setFlightType } = useFlightSearch();
    const { tripType } = flightState;

    return (
        <div className="flex gap-2 sm:p-1 sm:bg-slate-100 sm:dark:bg-white/5 sm:rounded-full sm:border sm:border-slate-200 sm:dark:border-white/5 mb-3 sm:mb-4 w-fit mx-auto">
            {(['round-trip', 'one-way'] as const).map((type) => (
                <button
                    key={type}
                    onClick={() => setFlightType(type)}
                    className={`relative px-4 py-1.5 rounded-full text-[10px] sm:text-xs font-bold transition-all duration-300 ${tripType === type
                        ? 'text-blue-600 dark:text-white shadow-sm sm:shadow-none'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                >
                    {tripType === type && (
                        <motion.div
                            layoutId="flightTripTypeBg"
                            className="absolute inset-0 bg-white dark:bg-blue-600 rounded-full border border-slate-200 dark:border-blue-500/30 sm:border-0"
                            initial={false}
                            transition={{ type: "spring", stiffness: 500, damping: 35 }}
                        />
                    )}
                    <span className="relative z-10">
                        {type.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                </button>
            ))}
        </div>
    );
};
