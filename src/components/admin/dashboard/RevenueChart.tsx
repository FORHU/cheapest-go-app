"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, ArrowUpRight, DollarSign, ChevronDown, ChevronUp } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { useUserCurrency } from '@/stores/searchStore';
import { convertCurrency } from '@/lib/currency';

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
    defaultCurrency?: string;
}

function formatShortCurrency(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toFixed(0);
}

function formatDateLabel(dateStr: string, timeframe: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    if (timeframe === 'monthly') return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
    return d.toLocaleDateString('en', { weekday: 'short', day: 'numeric' });
}

export function RevenueChart({ data, defaultCurrency }: RevenueChartProps) {
    const userCurrency = useUserCurrency();
    const activeCurrency = defaultCurrency || userCurrency || 'PHP';
    const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'monthly'>('daily');
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

    // Convert data to active currency
    const currentData = React.useMemo(() => {
        return data[timeframe].map(d => ({
            ...d,
            revenue: convertCurrency(d.revenue, 'PHP', activeCurrency)
        }));
    }, [data, timeframe, activeCurrency]);

    const maxRevenue = Math.max(...currentData.map(d => d.revenue), 100);
    // Round maxRevenue up to a nice number for Y-axis
    const niceMax = (() => {
        if (maxRevenue <= 0) return 100;
        const magnitude = Math.pow(10, Math.floor(Math.log10(maxRevenue)));
        return Math.ceil(maxRevenue / magnitude) * magnitude;
    })();

    const leftPadding = 80;
    const rightPadding = 20;
    const topPadding = 30;
    const bottomPadding = 50;
    const width = 800;
    const height = 320;
    const chartWidth = width - leftPadding - rightPadding;
    const chartHeight = height - topPadding - bottomPadding;

    // Calculate path points
    const points = currentData.map((d, i) => ({
        x: (i / Math.max(currentData.length - 1, 1)) * chartWidth + leftPadding,
        y: topPadding + chartHeight - (d.revenue / niceMax) * chartHeight,
    }));

    // Create SVG path string
    const linePath = points.reduce((acc, point, i) =>
        i === 0 ? `M ${point.x} ${point.y}` : `${acc} L ${point.x} ${point.y}`,
        "");

    // Create area path string (closing the path to the bottom)
    const areaPath = `${linePath} L ${points[points.length - 1].x} ${topPadding + chartHeight} L ${points[0].x} ${topPadding + chartHeight} Z`;

    const totalRevenue = currentData.reduce((acc, d) => acc + d.revenue, 0);

    // Y-axis tick values
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(p => ({
        value: niceMax * p,
        y: topPadding + chartHeight - p * chartHeight,
    }));

    // X-axis labels — show a subset to avoid crowding
    const labelInterval = timeframe === 'monthly' ? 5 : timeframe === 'weekly' ? 2 : 1;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 p-8 rounded-xl shadow-md flex flex-col group transition-all duration-500 min-h-[450px]"
        >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 relative z-10">
                <div className="flex-1">
                    <div className="flex items-center justify-between md:justify-start gap-4 mb-2">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 transition-colors">
                                <TrendingUp size={20} />
                            </div>
                            <h3 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white transition-colors">Revenue Trend</h3>
                        </div>
                    </div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1 transition-colors">Financial Performance Overview</p>
                </div>

                <div className="flex items-center p-1.5 bg-slate-50 dark:bg-white/5 rounded-xl gap-1 transition-colors">
                    {(['daily', 'weekly', 'monthly'] as const).map((t) => (
                        <button
                            key={t}
                            onClick={() => setTimeframe(t)}
                            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${timeframe === t
                                ? 'bg-white dark:bg-white/10 text-blue-600 dark:text-white shadow-sm ring-1 ring-slate-200/50 dark:ring-0'
                                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                                }`}
                        >
                            {t === 'daily' ? '7 Days' : t === 'weekly' ? '14 Days' : '30 Days'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
                    <div className="md:col-span-1 space-y-1">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] transition-colors">Total Revenue</p>
                        <div className="flex items-baseline gap-2">
                            <h4 className="text-3xl font-black text-slate-900 dark:text-white transition-colors">{formatCurrency(totalRevenue, activeCurrency)}</h4>
                        </div>
                    </div>
                </div>

                <div className="relative h-[320px] w-full">
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

                        {/* Y-axis labels + grid lines */}
                        {yTicks.map((tick) => (
                            <g key={tick.value}>
                                <line
                                    x1={leftPadding}
                                    y1={tick.y}
                                    x2={width - rightPadding}
                                    y2={tick.y}
                                    stroke="currentColor"
                                    strokeWidth="1"
                                    strokeDasharray="4 4"
                                    className="text-slate-100 dark:text-white/5"
                                />
                                <text
                                    x={leftPadding - 10}
                                    y={tick.y + 4}
                                    textAnchor="end"
                                    className="fill-slate-400 dark:fill-slate-500 text-[11px] font-bold"
                                >
                                    {formatShortCurrency(tick.value)}
                                </text>
                            </g>
                        ))}

                        {/* X-axis date labels */}
                        {currentData.map((d, i) => {
                            if (i % labelInterval !== 0 && i !== currentData.length - 1) return null;
                            return (
                                <text
                                    key={i}
                                    x={points[i]?.x ?? 0}
                                    y={height - 8}
                                    textAnchor="middle"
                                    className="fill-slate-400 dark:fill-slate-500 text-[10px] font-bold"
                                >
                                    {formatDateLabel(d.date, timeframe)}
                                </text>
                            );
                        })}

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

                                {/* Hover vertical guide line */}
                                {hoveredIndex !== null && points[hoveredIndex] && (
                                    <line
                                        x1={points[hoveredIndex].x}
                                        y1={topPadding}
                                        x2={points[hoveredIndex].x}
                                        y2={topPadding + chartHeight}
                                        stroke="currentColor"
                                        strokeWidth="1"
                                        strokeDasharray="4 4"
                                        className="text-blue-300 dark:text-blue-600"
                                    />
                                )}

                                {/* Data Points + Hover Areas */}
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
                                            r={hoveredIndex === i ? 8 : 5}
                                            className={`fill-white dark:fill-obsidian stroke-blue-600 transition-all ${hoveredIndex === i ? 'stroke-[4px]' : 'stroke-[3px]'}`}
                                        />
                                        {/* Invisible hover target */}
                                        <circle
                                            cx={point.x}
                                            cy={point.y}
                                            r="24"
                                            className="fill-transparent cursor-pointer"
                                            onMouseEnter={() => setHoveredIndex(i)}
                                            onMouseLeave={() => setHoveredIndex(null)}
                                        />
                                    </motion.g>
                                ))}

                                {/* Tooltip */}
                                {hoveredIndex !== null && points[hoveredIndex] && currentData[hoveredIndex] && (
                                    <g>
                                        <rect
                                            x={points[hoveredIndex].x - 60}
                                            y={points[hoveredIndex].y - 52}
                                            width="120"
                                            height="40"
                                            rx="10"
                                            className="fill-slate-900 dark:fill-slate-100"
                                        />
                                        <text
                                            x={points[hoveredIndex].x}
                                            y={points[hoveredIndex].y - 36}
                                            textAnchor="middle"
                                            className="fill-white dark:fill-slate-900 text-[11px] font-bold"
                                        >
                                            {formatCurrency(currentData[hoveredIndex].revenue, activeCurrency)}
                                        </text>
                                        <text
                                            x={points[hoveredIndex].x}
                                            y={points[hoveredIndex].y - 21}
                                            textAnchor="middle"
                                            className="fill-slate-400 dark:fill-slate-500 text-[9px] font-bold"
                                        >
                                            {formatDateLabel(currentData[hoveredIndex].date, timeframe)}
                                        </text>
                                    </g>
                                )}
                            </motion.g>
                        </AnimatePresence>
                    </svg>
                </div>
            </div>

            {/* Decoration */}
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-blue-500/5 blur-[80px] rounded-full pointer-events-none transition-all duration-700" />
            <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-purple-500/5 blur-[80px] rounded-full pointer-events-none transition-all duration-700" />
        </motion.div>
    );
}
