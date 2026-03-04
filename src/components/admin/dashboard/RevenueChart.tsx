"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, ArrowUpRight, DollarSign } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

interface DataPoint {
    date: string;
    revenue: number;
}

interface RevenueChartProps {
    data: {
        daily: DataPoint[];
        weekly: DataPoint[];
        monthly: DataPoint[];
    };
}

export function RevenueChart({ data }: RevenueChartProps) {
    const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'monthly'>('daily');
    const currentData = data[timeframe];

    const maxRevenue = Math.max(...currentData.map(d => d.revenue), 100);
    const padding = 40;
    const width = 800;
    const height = 300;

    // Calculate path points
    const points = currentData.map((d, i) => ({
        x: (i / (currentData.length - 1)) * (width - padding * 2) + padding,
        y: height - ((d.revenue / maxRevenue) * (height - padding * 2)) - padding
    }));

    // Create SVG path string
    const linePath = points.reduce((acc, point, i) =>
        i === 0 ? `M ${point.x} ${point.y}` : `${acc} L ${point.x} ${point.y}`,
        "");

    // Create area path string (closing the path to the bottom)
    const areaPath = `${linePath} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

    const totalRevenue = currentData.reduce((acc, d) => acc + d.revenue, 0);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden group"
        >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 relative z-10">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                            <TrendingUp size={20} />
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Revenue Trend</h3>
                    </div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Financial Performance Overview</p>
                </div>

                <div className="flex items-center p-1.5 bg-slate-50 dark:bg-white/5 rounded-2xl gap-1">
                    {(['daily', 'weekly', 'monthly'] as const).map((t) => (
                        <button
                            key={t}
                            onClick={() => setTimeframe(t)}
                            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${timeframe === t
                                ? 'bg-white dark:bg-white/10 text-blue-600 dark:text-white shadow-sm ring-1 ring-slate-200/50 dark:ring-0'
                                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                                }`}
                        >
                            {t}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
                <div className="md:col-span-1 space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Total Revenue</p>
                    <div className="flex items-baseline gap-2">
                        <h4 className="text-3xl font-black text-slate-900 dark:text-white">{formatCurrency(totalRevenue)}</h4>
                    </div>
                </div>
            </div>

            <div className="relative h-[300px] w-full">
                <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
                    <defs>
                        <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#3b82f6" />
                            <stop offset="100%" stopColor="#8b5cf6" />
                        </linearGradient>
                        <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
                            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                        </linearGradient>
                    </defs>

                    {/* Grid Lines */}
                    {[0, 0.25, 0.5, 0.75, 1].map((p) => (
                        <line
                            key={p}
                            x1={padding}
                            y1={padding + (height - padding * 2) * p}
                            x2={width - padding}
                            y2={padding + (height - padding * 2) * p}
                            stroke="currentColor"
                            strokeWidth="1"
                            strokeDasharray="4 4"
                            className="text-slate-100 dark:text-white/5"
                        />
                    ))}

                    <AnimatePresence mode="wait">
                        <motion.g
                            key={timeframe}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.5 }}
                        >
                            {/* Area Fill */}
                            <motion.path
                                d={areaPath}
                                fill="url(#areaGradient)"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.8, ease: "easeOut" }}
                            />

                            {/* Line Path */}
                            <motion.path
                                d={linePath}
                                fill="none"
                                stroke="url(#lineGradient)"
                                strokeWidth="4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                initial={{ pathLength: 0, opacity: 0 }}
                                animate={{ pathLength: 1, opacity: 1 }}
                                transition={{ duration: 1.2, ease: "easeInOut" }}
                            />

                            {/* Data Points */}
                            {points.map((point, i) => (
                                <motion.g
                                    key={i}
                                    initial={{ scale: 0, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ delay: 0.8 + i * 0.05 }}
                                >
                                    <circle
                                        cx={point.x}
                                        cy={point.y}
                                        r="6"
                                        className="fill-white dark:fill-obsidian stroke-blue-600 stroke-[3px]"
                                    />
                                    {/* Tooltip Hover Area */}
                                    <circle
                                        cx={point.x}
                                        cy={point.y}
                                        r="20"
                                        className="fill-transparent cursor-pointer group/point"
                                    />
                                </motion.g>
                            ))}
                        </motion.g>
                    </AnimatePresence>
                </svg>
            </div>

            {/* Decoration */}
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-blue-500/5 blur-[80px] rounded-full pointer-events-none group-hover:bg-blue-500/10 transition-all duration-700" />
            <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-purple-500/5 blur-[80px] rounded-full pointer-events-none group-hover:bg-purple-500/10 transition-all duration-700" />
        </motion.div>
    );
}
