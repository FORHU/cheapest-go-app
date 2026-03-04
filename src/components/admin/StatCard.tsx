"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { LucideIcon, TrendingUp } from 'lucide-react';
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
    variant?: 'white' | 'blue';
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
    const trendValue = typeof trend === 'object' ? trend.value : trend;
    const isPositive = typeof trend === 'object' ? trend.isPositive : true;

    return (
        <motion.div
            whileHover={{ y: -5 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="h-full"
        >
            <div className={`p-8 rounded-[2rem] relative h-full overflow-hidden group border transition-all duration-500 ${isBlue
                ? 'bg-blue-600 border-blue-500 text-white shadow-2xl shadow-blue-500/30'
                : 'bg-white dark:bg-obsidian border-slate-100 dark:border-white/10 shadow-xl'
                } ${className}`}>
                <div className="relative z-10 flex flex-col h-full justify-between gap-8">
                    <div className="flex items-start justify-between">
                        <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${isBlue ? 'text-blue-200' : 'text-slate-400'}`}>
                            {title}
                        </span>
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isBlue ? 'bg-white/10' : 'bg-slate-100 dark:bg-white/5 text-slate-400 group-hover:text-blue-500'} transition-colors overflow-hidden text-sm`}>
                            {React.createElement(Icon as any, { size: 18 })}
                        </div>
                    </div>
                    <div>
                        <h3 className={`font-black tracking-tighter mb-1 ${String(value).length > 10 ? 'text-2xl sm:text-3xl' : 'text-4xl'}`}>
                            {value}
                        </h3>
                        {trend && (
                            <div className="flex items-center gap-2 font-black text-[10px] uppercase tracking-wider">
                                <TrendingUp size={12} className={isBlue ? 'text-blue-300' : 'text-blue-500'} />
                                <span className={isBlue ? 'text-blue-100' : 'text-slate-500'}>
                                    {trendValue} <span className="opacity-60 ml-0.5">Performance</span>
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Background Decoration */}
                {isBlue ? (
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 blur-3xl rounded-full -mr-16 -mt-16 pointer-events-none" />
                ) : (
                    <div className="absolute -bottom-10 -right-10 w-24 h-24 bg-blue-500/5 blur-2xl rounded-full pointer-events-none group-hover:bg-blue-500/10 transition-colors" />
                )}
            </div>
        </motion.div>
    );
}
