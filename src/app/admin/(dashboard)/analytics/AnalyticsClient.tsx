"use client";

import React from 'react';
import { motion } from 'framer-motion';
import {
    Activity,
    AlertCircle,
    CheckCircle2,
    Clock,
    Zap,
    Bug,
    ShieldAlert,
    BarChart3,
    TrendingUp,
    Users,
    CalendarCheck,
    CreditCard
} from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { HeaderTitle } from '@/components/admin/HeaderTitle';
import { StatCard } from '@/components/admin/StatCard';
import { formatCurrency } from '@/lib/utils';
import type { AdvancedAnalyticsData } from '@/types/admin';

interface AnalyticsClientProps {
    data: AdvancedAnalyticsData;
}

export function AnalyticsClient({ data }: AnalyticsClientProps) {
    const { providerSuccess, ticketingLatency, errorLogs } = data;

    return (
        <div className="space-y-10 pb-20">
            <HeaderTitle
                title="Analytics"
                subtitle="Detailed insights into platform performance and growth"
                actions={
                    <Button variant="outline" className="rounded-xl border-slate-200 dark:border-white/10 dark:bg-white/5 font-bold h-12 px-6 hover:bg-slate-50 transition-all gap-2">
                        <BarChart3 size={18} />
                        Generating Report
                    </Button>
                }
            />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: 'Platform Health', value: '98.4%', trend: '+1.2%', icon: CreditCard },
                    { label: 'Booking Success', value: '92.0%', trend: '+0.8%', icon: TrendingUp, variant: 'blue' as const },
                    { label: 'Edge Latency', value: '1.2s', trend: '-4.2%', icon: Users },
                    { label: 'Sync Efficiency', value: '99.9%', trend: '+0.1%', icon: CalendarCheck },
                ].map((stat, i) => (
                    <StatCard
                        key={i}
                        title={stat.label}
                        value={stat.value}
                        icon={stat.icon}
                        trend={stat.trend}
                        variant={stat.variant || 'white'}
                    />
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Provider Success Rates */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 p-8 rounded-xl shadow-xl"
                >
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-xl font-black text-slate-900 dark:text-white">Provider Success Rates</h3>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">mystifly vs duffel search effectiveness</p>
                        </div>
                        <div className="p-3 bg-blue-500/10 text-blue-500 rounded-xl">
                            <Zap size={20} />
                        </div>
                    </div>

                    <div className="space-y-8">
                        {providerSuccess.map((provider) => {
                            const total = provider.success + provider.failure || 1;
                            const rate = Math.round((provider.success / total) * 100);

                            return (
                                <div key={provider.name} className="space-y-3">
                                    <div className="flex justify-between items-end">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-2 h-8 rounded-full ${rate > 80 ? 'bg-emerald-500' : rate > 50 ? 'bg-amber-500' : 'bg-rose-500'}`} />
                                            <div>
                                                <p className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">{provider.name}</p>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase">{total} Total Operations</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-2xl font-black text-slate-900 dark:text-white">{rate}%</p>
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Success Rate</p>
                                        </div>
                                    </div>
                                    <div className="h-4 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden flex">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: String(rate) + '%' }}
                                            className="h-full bg-blue-600 rounded-l-full"
                                        />
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: String(100 - rate) + '%' }}
                                            className="h-full bg-rose-500/20"
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </motion.div>

                {/* Ticketing Latency */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 }}
                    className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 p-8 rounded-xl shadow-xl"
                >
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-xl font-black text-slate-900 dark:text-white">Ticketing Latency</h3>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Pending to Ticketed Time (Avg)</p>
                        </div>
                        <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-xl">
                            <Clock size={20} />
                        </div>
                    </div>

                    <div className="flex items-end justify-between h-48 gap-2">
                        {ticketingLatency.map((d, i) => {
                            const maxVal = Math.max(...ticketingLatency.map(x => x.avgSeconds), 1);
                            const height = Math.round((d.avgSeconds / maxVal) * 100);

                            return (
                                <div key={i} className="flex-1 flex flex-col items-center gap-4 group">
                                    <div className="relative w-full flex-1 flex flex-col justify-end">
                                        <motion.div
                                            initial={{ height: 0 }}
                                            animate={{ height: String(height) + '%' }}
                                            className={`w-full rounded-t-xl transition-all duration-500 ${d.avgSeconds > 120 ? 'bg-rose-500' : d.avgSeconds > 60 ? 'bg-amber-500' : 'bg-indigo-600'} group-hover:brightness-110 shadow-lg`}
                                        >
                                            <div className="opacity-0 group-hover:opacity-100 absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[8px] font-black px-2 py-1 rounded-lg pointer-events-none transition-opacity">
                                                {d.avgSeconds}s
                                            </div>
                                        </motion.div>
                                    </div>
                                    <span className="text-[10px] font-black text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                                        {d.day}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-10 p-6 rounded-xl bg-indigo-500/5 border border-indigo-500/10 flex items-center gap-4">
                        <Activity className="text-indigo-600" size={24} />
                        <div>
                            <p className="text-sm font-black text-slate-900 dark:text-white">Service Health: Stable</p>
                            <p className="text-xs font-medium text-slate-500 italic">Average fulfillment time improved by 12% today.</p>
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* API Error Logs */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 p-8 rounded-xl shadow-xl"
            >
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-rose-500/10 text-rose-500 rounded-xl shadow-inner">
                            <ShieldAlert size={20} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-900 dark:text-white">API Error Logs</h3>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Live Edge Function Feed</p>
                        </div>
                    </div>
                    <Button variant="outline" className="rounded-xl border-slate-200 dark:border-white/10 dark:bg-white/5 font-black uppercase text-[10px] tracking-widest h-10 px-4">
                        Clear Feed
                    </Button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-transparent hover:bg-transparent border-none">
                                <th className="text-left py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Timestamp</th>
                                <th className="text-left py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Function</th>
                                <th className="text-left py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Error Message</th>
                                <th className="text-right py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 pr-6">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                            {errorLogs.map((log) => (
                                <tr key={log.id} className="group hover:bg-slate-50 dark:hover:bg-white/5 transition-colors border-none">
                                    <td className="py-5">
                                        <div className="flex flex-col">
                                            <span className="text-xs font-black text-slate-900 dark:text-white">
                                                {new Date(log.timestamp).toLocaleTimeString()}
                                            </span>
                                            <span className="text-[10px] font-bold text-slate-400 capitalize">
                                                {new Date(log.timestamp).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="py-5">
                                        <div className="flex items-center gap-2">
                                            <Bug size={14} className="text-rose-500 opacity-50" />
                                            <span className="text-xs font-black text-blue-600 dark:text-blue-400 font-mono">{log.functionName}</span>
                                        </div>
                                    </td>
                                    <td className="py-5">
                                        <span className="text-xs font-bold text-slate-600 dark:text-slate-400">{log.message}</span>
                                    </td>
                                    <td className="py-5 text-right pr-6">
                                        <Badge
                                            variant="destructive"
                                            className="bg-rose-500/10 text-rose-500 border-none font-black capitalize text-[9px] px-3 py-1 rounded-lg"
                                        >
                                            {log.status}
                                        </Badge>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <Button variant="ghost" className="w-full mt-8 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-rose-500 hover:bg-rose-500/5 rounded-xl border-t border-slate-50 dark:border-white/5 pt-8">
                    Enter Debug Console
                </Button>
            </motion.div>
        </div>
    );
}
