"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { BedDouble, Plane, Sparkles } from 'lucide-react';

type SearchMode = 'hotels' | 'flights' | 'ai';

interface SearchModeToggleProps {
    mode: SearchMode;
    onModeChange: (mode: SearchMode) => void;
}

const modes: { id: SearchMode; label: string; icon: React.ReactNode; mobileIcon: React.ReactNode }[] = [
    { id: 'hotels', label: 'Stays', icon: <BedDouble size={14} />, mobileIcon: <BedDouble size={12} /> },
    { id: 'flights', label: 'Flights', icon: <Plane size={14} />, mobileIcon: <Plane size={12} /> },
    { id: 'ai', label: 'AI Search', icon: <Sparkles size={14} />, mobileIcon: <Sparkles size={12} /> },
];

const SearchModeToggle: React.FC<SearchModeToggleProps> = ({ mode, onModeChange }) => {
    return (
        <div className="flex justify-center mb-3 md:mb-6 landscape-compact:mb-1">
            <div className="inline-flex bg-white/5 dark:bg-obsidian-surface backdrop-blur-xl rounded-full p-1 border border-alabaster-border dark:border-obsidian-border shadow-sm">
                {modes.map((m) => (
                    <motion.button
                        key={m.id}
                        onClick={() => onModeChange(m.id)}
                        className={`relative flex items-center gap-1.5 px-3 py-1.5 sm:px-5 sm:py-2.5 rounded-full text-xs sm:text-sm font-bold transition-all duration-300 ${mode === m.id
                            ? 'text-white shadow-md'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                            }`}
                        whileHover={{ scale: mode === m.id ? 1 : 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        {mode === m.id && (
                            <motion.div
                                layoutId="searchModeBg"
                                className="absolute inset-0 bg-blue-600 rounded-full"
                                initial={false}
                                transition={{ type: "spring", stiffness: 500, damping: 35 }}
                            />
                        )}
                        <span className="relative z-10 flex items-center gap-1.5">
                            <span className="hidden sm:inline">{m.icon}</span>
                            <span className="sm:hidden">{m.mobileIcon}</span>
                            {m.label}
                        </span>
                    </motion.button>
                ))}
            </div>
        </div>
    );
};

export default SearchModeToggle;
