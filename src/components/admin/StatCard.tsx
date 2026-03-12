"use client";

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LucideIcon, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

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

    // Map colors
    const getBgColor = () => {
        if (isBlue) return 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20';
        if (isRose) return 'bg-rose-600 border-rose-500 text-white shadow-lg shadow-rose-500/20';
        if (isAmber) return 'bg-amber-500 border-amber-400 text-white shadow-lg shadow-amber-500/20';
        if (isEmerald) return 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-500/20';
        return 'bg-white dark:bg-obsidian border-slate-100 dark:border-white/10 shadow-md';
    };

    const getTitleColor = () => {
        if (isBlue) return 'text-blue-200';
        if (isRose) return 'text-rose-200';
        if (isAmber) return 'text-amber-100';
        if (isEmerald) return 'text-emerald-100';
        return 'text-slate-400';
    };

    const getIconColor = () => {
        if (isWhite) return 'bg-slate-100 dark:bg-white/5 text-slate-400';
        return 'bg-white/10';
    };

    const getValueColor = () => {
        if (isWhite) return 'text-slate-900 dark:text-white';
        return 'text-white';
    };

    const getTrendIconColor = () => {
        if (isBlue) return 'text-blue-300';
        if (isRose) return 'text-rose-300';
        if (isAmber) return 'text-amber-200';
        if (isEmerald) return 'text-emerald-200';
        return 'text-blue-500';
    };

    const getTrendTextColor = () => {
        if (isWhite) return 'text-slate-500';
        return 'text-slate-50';
    };

    return (
        <motion.div
            whileHover={{ y: -5 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="h-full"
        >
            <div className={`p-8 rounded-xl relative h-full overflow-hidden group border transition-all duration-500 ${getBgColor()} ${className}`}>
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
                        <h3 className={`font-black tracking-tighter mb-1 transition-colors ${getValueColor()} ${String(value).length > 10 ? 'text-2xl sm:text-3xl' : 'text-4xl'}`}>
                            {value}
                        </h3>
                        {trend && (
                            <div className="flex items-center gap-2 font-black text-[10px] uppercase tracking-wider">
                                <TrendingUp size={12} className={getTrendIconColor()} />
                                <span className={`transition-colors ${getTrendTextColor()}`}>
                                    {trendValue} <span className="opacity-60 ml-0.5">Scale</span>
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Background Decoration */}
                {!isWhite ? (
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 blur-3xl rounded-full -mr-16 -mt-16 pointer-events-none" />
                ) : (
                    <div className="absolute -bottom-10 -right-10 w-24 h-24 bg-blue-500/5 blur-2xl rounded-full pointer-events-none transition-colors" />
                )}
            </div>
        </motion.div>
    );
}
