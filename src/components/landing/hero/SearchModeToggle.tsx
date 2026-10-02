"use client";

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { BedDouble, Flag, Plane, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

type SearchMode = 'hotels' | 'flights' | 'ai';

interface SearchModeToggleProps {
    mode: SearchMode;
    onModeChange: (mode: SearchMode) => void;
}

/** A mode tab swaps the search box; a link tab goes to a service with no search box (golf). */
type Tab = { label: string; icon: React.ReactNode; mobileIcon: React.ReactNode } &
    ({ kind: 'mode'; id: SearchMode } | { kind: 'link'; id: string; href: string });

const tabClass = 'relative flex items-center gap-1.5 px-3 py-1.5 sm:px-5 sm:py-2.5 rounded-full text-xs sm:text-sm font-bold transition-all duration-300';
const idleClass = 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200';

const SearchModeToggle: React.FC<SearchModeToggleProps> = ({ mode, onModeChange }) => {
    const t = useTranslations('landing.search.searchMode');
    const tabs: Tab[] = [
        { kind: 'mode', id: 'hotels',  label: t('stays'),    icon: <BedDouble size={14} />, mobileIcon: <BedDouble size={12} /> },
        { kind: 'mode', id: 'flights', label: t('flights'),  icon: <Plane size={14} />,     mobileIcon: <Plane size={12} /> },
        { kind: 'link', id: 'golf',    label: t('golf'),     icon: <Flag size={14} />,      mobileIcon: <Flag size={12} />, href: '/golf' },
        { kind: 'mode', id: 'ai',      label: t('aiSearch'), icon: <Sparkles size={14} />,  mobileIcon: <Sparkles size={12} /> },
    ];
    const content = (m: Tab) => (
        <span className="relative z-10 flex items-center gap-1.5">
            <span className="hidden sm:inline">{m.icon}</span>
            <span className="sm:hidden">{m.mobileIcon}</span>
            {m.label}
        </span>
    );
    return (
        <div className="flex justify-center mb-3 md:mb-6 landscape-compact:mb-1">
            <div className="inline-flex bg-white/5 dark:bg-obsidian-surface backdrop-blur-xl rounded-full p-1 border border-alabaster-border dark:border-obsidian-border shadow-sm">
                {tabs.map((m) => m.kind === 'link' ? (
                    <Link key={m.id} href={m.href} className={`${tabClass} ${idleClass} hover:scale-105 active:scale-95`}>
                        {content(m)}
                    </Link>
                ) : (
                    <motion.button
                        key={m.id}
                        onClick={() => onModeChange(m.id)}
                        className={`${tabClass} ${mode === m.id ? 'text-white shadow-md' : idleClass}`}
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
                        {content(m)}
                    </motion.button>
                ))}
            </div>
        </div>
    );
};

export default SearchModeToggle;
