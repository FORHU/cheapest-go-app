"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { MapPin, Calendar, Users, Wallet, Check, ArrowRight } from 'lucide-react';

interface ParsedResult {
    destination: string;
    dates: string;
    guests: string;
    budget: string;
}

interface AIResultsPreviewProps {
    result: ParsedResult;
    onSearch: () => void;
}

const paramCards = [
    { key: 'destination' as const, icon: MapPin, label: 'Destination', color: 'text-blue-500 dark:text-blue-400' },
    { key: 'dates' as const, icon: Calendar, label: 'Dates', color: 'text-emerald-500 dark:text-emerald-400' },
    { key: 'guests' as const, icon: Users, label: 'Guests', color: 'text-purple-500 dark:text-purple-400' },
    { key: 'budget' as const, icon: Wallet, label: 'Budget', color: 'text-amber-500 dark:text-amber-400' },
];

const AIResultsPreview: React.FC<AIResultsPreviewProps> = ({ result, onSearch }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 200, damping: 25 }}
            className="mt-3 bg-white/40 dark:bg-white/5 backdrop-blur-xl rounded-xl border border-white/20 dark:border-white/10 p-4 overflow-hidden"
        >
            {/* Header */}
            <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center gap-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2.5 py-1 rounded-full">
                    <Check size={12} strokeWidth={3} />
                    <span className="text-[10px] font-mono font-semibold uppercase tracking-wider">
                        AI Understood
                    </span>
                </div>
                <span className="text-sm text-slate-500 dark:text-slate-400">
                    Here&apos;s what I found
                </span>
            </div>

            {/* Parsed Parameters */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                {paramCards.map((param, i) => {
                    const Icon = param.icon;
                    const value = result[param.key];
                    return (
                        <motion.div
                            key={param.key}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.08 + 0.2 }}
                            className="bg-white/60 dark:bg-slate-800/50 rounded-lg px-3 py-2.5 border border-slate-100 dark:border-white/5"
                        >
                            <div className="flex items-center gap-1.5 mb-1">
                                <Icon size={12} className={param.color} />
                                <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                                    {param.label}
                                </span>
                            </div>
                            <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                {value}
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {/* CTA Button */}
            <motion.button
                onClick={onSearch}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-display font-bold text-sm tracking-wide transition-all duration-300 bg-gradient-to-r from-blue-600 to-cyan-500 dark:from-blue-500 dark:to-cyan-400 text-white shadow-[0_0_20px_rgba(37,99,235,0.3)] dark:shadow-[0_0_20px_rgba(34,211,238,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.4)] dark:hover:shadow-[0_0_30px_rgba(34,211,238,0.4)]"
            >
                <span>Search with these details</span>
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </motion.button>
        </motion.div>
    );
};

export default AIResultsPreview;
