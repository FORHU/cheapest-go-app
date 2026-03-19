"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { LucideIcon, TrendingUp } from 'lucide-react';

interface StatCardProps {
    title: string;
    value: string | number;
    icon: LucideIcon | (() => React.ReactNode);
    trend?: {
        value: string | number;
        isPositive?: boolean;
    } | string;
    className?: string;
    variant?: 'white' | 'blue' | 'rose' | 'amber' | 'emerald';
}

export function StatCard({
    title,
    value,
    icon: Icon,
    trend,
    className = '',
    variant = 'white'
}: StatCardProps) {
    const isBlue = variant === 'blue';
    const isRose = variant === 'rose';
    const isAmber = variant === 'amber';
    const isEmerald = variant === 'emerald';
    const isWhite = variant === 'white';

    const trendValue = typeof trend === 'object' ? trend.value : trend;

    const getBgColor = () => {
        if (isBlue) return 'bg-blue-500/15 dark:bg-blue-500/10 backdrop-blur-xl border-blue-400/30 dark:border-blue-400/20 shadow-xl shadow-blue-500/10 dark:shadow-blue-500/5 ring-1 ring-blue-400/20';
        if (isRose) return 'bg-rose-500/15 dark:bg-rose-500/10 backdrop-blur-xl border-rose-400/30 dark:border-rose-400/20 shadow-xl shadow-rose-500/10 dark:shadow-rose-500/5 ring-1 ring-rose-400/20';
        if (isAmber) return 'bg-amber-500/15 dark:bg-amber-500/10 backdrop-blur-xl border-amber-400/30 dark:border-amber-400/20 shadow-xl shadow-amber-500/10 dark:shadow-amber-500/5 ring-1 ring-amber-400/20';
        if (isEmerald) return 'bg-emerald-500/15 dark:bg-emerald-500/10 backdrop-blur-xl border-emerald-400/30 dark:border-emerald-400/20 shadow-xl shadow-emerald-500/10 dark:shadow-emerald-500/5 ring-1 ring-emerald-400/20';
        return 'bg-white/70 dark:bg-white/[0.04] backdrop-blur-xl border-white/20 dark:border-white/[0.08] shadow-xl shadow-black/5 dark:shadow-black/20';
    };

    const getTitleColor = () => {
        if (isBlue) return 'text-blue-500/70 dark:text-blue-400/70';
        if (isRose) return 'text-rose-500/70 dark:text-rose-400/70';
        if (isAmber) return 'text-amber-600/70 dark:text-amber-400/70';
        if (isEmerald) return 'text-emerald-500/70 dark:text-emerald-400/70';
        return 'text-slate-400';
    };

    const getIconColor = () => {
        if (isBlue) return 'bg-blue-500/15 dark:bg-blue-400/10 text-blue-600 dark:text-blue-400';
        if (isRose) return 'bg-rose-500/15 dark:bg-rose-400/10 text-rose-600 dark:text-rose-400';
        if (isAmber) return 'bg-amber-500/15 dark:bg-amber-400/10 text-amber-600 dark:text-amber-400';
        if (isEmerald) return 'bg-emerald-500/15 dark:bg-emerald-400/10 text-emerald-600 dark:text-emerald-400';
        return 'bg-slate-100/80 dark:bg-white/[0.06] text-slate-400 backdrop-blur-sm';
    };

    const getValueColor = () => {
        if (isBlue) return 'text-blue-800 dark:text-blue-200';
        if (isRose) return 'text-rose-800 dark:text-rose-200';
        if (isAmber) return 'text-amber-800 dark:text-amber-200';
        if (isEmerald) return 'text-emerald-800 dark:text-emerald-200';
        return 'text-slate-900 dark:text-white';
    };

    const getTrendIconColor = () => {
        if (isBlue) return 'text-blue-500 dark:text-blue-400';
        if (isRose) return 'text-rose-500 dark:text-rose-400';
        if (isAmber) return 'text-amber-500 dark:text-amber-400';
        if (isEmerald) return 'text-emerald-500 dark:text-emerald-400';
        return 'text-blue-500';
    };

    const getTrendTextColor = () => {
        if (isBlue) return 'text-blue-600/80 dark:text-blue-300/80';
        if (isRose) return 'text-rose-600/80 dark:text-rose-300/80';
        if (isAmber) return 'text-amber-600/80 dark:text-amber-300/80';
        if (isEmerald) return 'text-emerald-600/80 dark:text-emerald-300/80';
        return 'text-slate-500';
    };

    // Decoration orb colors per variant
    const orbColor = isBlue ? [59, 130, 246] : isRose ? [244, 63, 94] : isAmber ? [245, 158, 11] : isEmerald ? [16, 185, 129] : [100, 116, 139];

    return (
        <motion.div
            whileHover={{ y: -5 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="h-full"
        >
            <div className={`p-8 rounded-2xl relative h-full overflow-hidden group border transition-all duration-500 ${getBgColor()} ${className}`}>
                <div className="relative z-10 flex flex-col h-full gap-8">
                    <div className="flex items-start justify-between">
                        <div className="flex flex-col">
                            <span className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${getTitleColor()}`}>
                                {title}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${getIconColor()} overflow-hidden text-sm`}>
                                {React.createElement(Icon as any, { size: 18 })}
                            </div>
                        </div>
                    </div>

                    <div className="mt-auto">
                        <h3
                            className={`font-black tracking-tighter mb-1 transition-colors ${getValueColor()} ${String(value).length > 10 ? 'text-2xl sm:text-3xl' : 'text-4xl'}`}
                            suppressHydrationWarning
                        >
                            {value}
                        </h3>
                        {trend && (
                            <div className="flex items-center gap-2 font-black text-[10px] uppercase tracking-wider">
                                <TrendingUp size={12} className={getTrendIconColor()} />
                                <span className={`transition-colors ${getTrendTextColor()}`} suppressHydrationWarning>
                                    {trendValue} <span className="opacity-60 ml-0.5">Scale</span>
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Decorative gradient orbs */}
                <div
                    className="absolute top-0 right-0 w-32 h-32 rounded-full -mr-16 -mt-16 pointer-events-none blur-3xl opacity-60"
                    style={{ background: `rgba(${orbColor.join(',')}, ${isWhite ? 0.06 : 0.15})` }}
                />
                <div
                    className="absolute -bottom-8 -left-8 w-24 h-24 rounded-full pointer-events-none blur-2xl opacity-40"
                    style={{ background: `rgba(${orbColor.join(',')}, ${isWhite ? 0.08 : 0.2})` }}
                />
                <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full pointer-events-none blur-2xl opacity-30"
                    style={{ background: `rgba(${orbColor.join(',')}, ${isWhite ? 0.05 : 0.1})` }}
                />
            </div>
        </motion.div>
    );
}
