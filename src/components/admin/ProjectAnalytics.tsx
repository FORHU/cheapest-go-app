"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, MousePointer2 } from 'lucide-react';

interface ChartData {
    day: string;
    value: number;
    type: 'actual' | 'projected';
}

const data: ChartData[] = [
    { day: 'S', value: 65, type: 'projected' },
    { day: 'M', value: 85, type: 'actual' },
    { day: 'T', value: 74, type: 'actual' },
    { day: 'W', value: 95, type: 'actual' },
    { day: 'T', value: 80, type: 'projected' },
    { day: 'F', value: 60, type: 'projected' },
    { day: 'S', value: 85, type: 'projected' },
];

export function ProjectAnalytics() {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 rounded-[2rem] p-8 shadow-xl h-full relative overflow-hidden group"
        >
            <div className="flex items-center justify-between mb-12">
                <div>
                    <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Project Analytics</h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Weekly Performance</p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-blue-600 dark:text-blue-400">
                    <TrendingUp size={14} />
                    <span className="text-[10px] font-black uppercase tracking-wider">+14.2%</span>
                </div>
            </div>

            <div className="flex items-end justify-between h-48 gap-2 px-2">
                {data.map((item, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-4 group/bar h-full justify-end">
                        <div className="relative w-full h-full flex items-end justify-center">
                            {/* Bar Column */}
                            <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: `${item.value}%` }}
                                transition={{ delay: 0.2 + (i * 0.1), type: 'spring', stiffness: 100 }}
                                className={`w-full max-w-[3.5rem] rounded-full relative overflow-hidden transition-all duration-500 hover:scale-105 active:scale-95 cursor-pointer ${item.type === 'actual'
                                        ? i === 3 ? 'bg-blue-900' : i === 1 ? 'bg-blue-700' : 'bg-blue-500'
                                        : 'bg-slate-200 dark:bg-white/10'
                                    }`}
                            >
                                {/* Striped Overlays for Projected */}
                                {item.type === 'projected' && (
                                    <div className="absolute inset-0 bg-diagonal-stripe opacity-40 dark:opacity-20" />
                                )}

                                {/* Actual color for striped projected effect (S, T, F, S) */}
                                {item.type === 'projected' && (
                                    <div className="absolute inset-0 opacity-10 bg-blue-600" />
                                )}

                                {/* Hover Glow */}
                                <div className="absolute inset-0 bg-white/20 opacity-0 group-hover/bar:opacity-100 transition-opacity" />

                                {/* Tooltip for T (index 2) as in UI */}
                                {i === 2 && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 1.5 }}
                                        className="absolute -top-12 left-1/2 -translate-x-1/2 z-20"
                                    >
                                        <div className="bg-white dark:bg-slate-800 shadow-xl border border-slate-100 dark:border-white/10 rounded-lg px-2 py-1 flex flex-col items-center">
                                            <span className="text-[10px] font-black text-slate-900 dark:text-white whitespace-nowrap">{item.value}%</span>
                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1 shadow-glow shadow-blue-500/50" />
                                            {/* Tooltip Arrow */}
                                            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white dark:bg-slate-800 border-r border-b border-slate-100 dark:border-white/10 rotate-45" />
                                        </div>
                                    </motion.div>
                                )}
                            </motion.div>
                        </div>
                        <span className={`text-[10px] font-black uppercase tracking-wider ${item.day === 'T' && i === 2 ? 'text-blue-600' : 'text-slate-400'}`}>
                            {item.day}
                        </span>
                    </div>
                ))}
            </div>

            {/* Background Decoration */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-3xl rounded-full -mr-16 -mt-16 pointer-events-none group-hover:bg-blue-500/10 transition-colors duration-700" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-blue-500/5 blur-2xl rounded-full -ml-12 -mb-12 pointer-events-none group-hover:bg-blue-500/10 transition-colors duration-700" />
        </motion.div>
    );
}
