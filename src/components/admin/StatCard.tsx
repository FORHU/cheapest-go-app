"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface StatCardProps {
    title: string;
    value: string | number;
    icon: LucideIcon;
    trend?: {
        value: number;
        isPositive: boolean;
    };
    className?: string;
}

export function StatCard({ title, value, icon: Icon, trend, className = '' }: StatCardProps) {
    return (
        <motion.div whileHover={{ y: -5 }} className="h-full">
            <Card className={`relative h-full overflow-hidden bg-white/50 dark:bg-obsidian/50 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-2xl shadow-sm ${className}`}>
                <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
                            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{value}</h3>

                            {trend && (
                                <div className="flex items-center gap-1 mt-2">
                                    <span className={`text-xs font-medium ${trend.isPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
                                        {trend.isPositive ? '+' : '-'}{Math.abs(trend.value)}%
                                    </span>
                                    <span className="text-xs text-slate-400 dark:text-slate-500">from last month</span>
                                </div>
                            )}
                        </div>

                        <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-xl">
                            <Icon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                        </div>
                    </div>

                    {/* Decorative gradient blur */}
                    <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-blue-500/20 blur-2xl rounded-full pointer-events-none" />
                </CardContent>
            </Card>
        </motion.div>
    );
}
