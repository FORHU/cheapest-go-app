"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Search, Sparkles } from 'lucide-react';

type SearchMode = 'classic' | 'ai';

interface SearchModeToggleProps {
    mode: SearchMode;
    onModeChange: (mode: SearchMode) => void;
}

const modes: { id: SearchMode; label: string; icon: React.ReactNode }[] = [
    { id: 'classic', label: 'Classic', icon: <Search size={14} /> },
    { id: 'ai', label: 'AI Search', icon: <Sparkles size={14} /> },
];

const SearchModeToggle: React.FC<SearchModeToggleProps> = ({ mode, onModeChange }) => {
    return (
        <div className="flex justify-center mb-4">
            <div className="inline-flex bg-white/5 dark:bg-obsidian-surface backdrop-blur-xl rounded-full p-1 border border-alabaster-border dark:border-obsidian-border">
                {modes.map((m) => (
                    <motion.button
                        key={m.id}
                        onClick={() => onModeChange(m.id)}
                        className={`relative flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium transition-colors duration-300 ${
                            mode === m.id
                                ? 'text-white'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                        whileHover={{ scale: mode === m.id ? 1 : 1.02 }}
                        whileTap={{ scale: 0.98 }}
                    >
                        {mode === m.id && (
                            <motion.div
                                layoutId="searchModeBg"
                                className="absolute inset-0 bg-gradient-to-r from-blue-600 to-cyan-500 dark:from-blue-500 dark:to-cyan-400 rounded-full"
                                initial={false}
                                transition={{ type: "spring", stiffness: 500, damping: 35 }}
                            />
                        )}
                        <span className="relative z-10 flex items-center gap-1.5">
                            {m.icon}
                            {m.label}
                        </span>
                    </motion.button>
                ))}
            </div>
        </div>
    );
};

export default SearchModeToggle;
