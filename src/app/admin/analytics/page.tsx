"use client";

import React from 'react';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { BarChart3, TrendingUp, TrendingDown, Users, CalendarCheck, CreditCard, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatCurrency } from '@/lib/utils';

export default function AdminAnalyticsPage() {
    return (
        <div className="space-y-6 sm:space-y-8">
            <SectionHeader
                title="Analytics"
                subtitle="Detailed insights into platform performance and growth."
                size="lg"
                icon={BarChart3}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                {[
                    { label: 'Total Revenue', value: 125430, change: '+12.5%', icon: CreditCard, color: 'blue' },
                    { label: 'Conversion Rate', value: '3.2%', change: '+0.8%', icon: TrendingUp, color: 'blue' },
                    { label: 'Active Users', value: 8420, change: '+18.2%', icon: Users, color: 'blue' },
                    { label: 'Total Bookings', value: 1240, change: '-2.4%', icon: CalendarCheck, color: 'blue' },
                ].map((stat, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="bg-white/50 dark:bg-obsidian/50 backdrop-blur-xl border border-white/20 dark:border-white/10 p-6 rounded-2xl shadow-sm"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div className={`p-2 rounded-lg bg-${stat.color}-500/10 text-${stat.color}-500`}>
                                <stat.icon size={20} />
                            </div>
                            <span className={`text-xs font-bold ${stat.change.startsWith('+') ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {stat.change}
                            </span>
                        </div>
                        <p className="text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">{stat.label}</p>
                        <h4 className="text-2xl font-bold text-slate-900 dark:text-white">
                            {typeof stat.value === 'number' ? formatCurrency(stat.value, 'USD', 'en-US') : stat.value}
                        </h4>
                    </motion.div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-white/50 dark:bg-obsidian/50 backdrop-blur-xl border border-white/20 dark:border-white/10 p-6 rounded-2xl shadow-sm h-[400px] flex flex-col"
                >
                    <h5 className="font-bold text-slate-900 dark:text-white mb-4">User Growth</h5>
                    <div className="flex-1 flex items-center justify-center border border-dashed border-slate-200 dark:border-white/10 rounded-xl">
                        <p className="text-slate-400 text-sm">Growth Chart Visualization</p>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-white/50 dark:bg-obsidian/50 backdrop-blur-xl border border-white/20 dark:border-white/10 p-6 rounded-2xl shadow-sm h-[400px] flex flex-col"
                >
                    <h5 className="font-bold text-slate-900 dark:text-white mb-4">Revenue by Service</h5>
                    <div className="flex-1 flex items-center justify-center border border-dashed border-slate-200 dark:border-white/10 rounded-xl">
                        <p className="text-slate-400 text-sm">Distribution Chart Visualization</p>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
