"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { CalendarCheck, DollarSign, Clock, XCircle, Building2, Plane, Activity, MoreHorizontal, TrendingUp, Plus, FileDown, ArrowRight, Coins, Banknote } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ProjectAnalytics } from '@/components/admin/ProjectAnalytics';
import { Button } from '@/components/ui/Button';
import { StatCard } from '@/components/admin/StatCard';
import { formatCurrency } from '@/lib/utils';
import type { DashboardData } from '@/lib/server/adminActions';
import { HeaderTitle } from '@/components/admin/HeaderTitle';
import { StatsGrid } from '@/components/admin/StatsGrid';
import { RevenueChart } from '@/components/admin/dashboard/RevenueChart';
import { ConversionFunnel } from '@/components/admin/dashboard/ConversionFunnel';
import { TopRoutes } from '@/components/admin/dashboard/TopRoutes';

interface AdminDashboardClientProps {
    data: DashboardData;
}

type GraphType = 'market' | 'volume' | 'list';

export default function AdminDashboardClient({ data }: AdminDashboardClientProps) {
    const {
        stats: liveStats,
        recentActivity,
        analytics,
        supplierBreakdown,
        revenueTrend,
        conversionFunnel,
        topRoutes
    } = data;
    const [graphType, setGraphType] = useState<GraphType>('market');

    return (
        <div className="space-y-10 pb-20">
            <HeaderTitle
                title='Dashboard'
                subtitle='Platform Overview'
                actions={
                    <div className="flex items-center gap-3">
                        <Button variant="outline" className="rounded-2xl border-slate-200 dark:border-white/10 dark:bg-white/5 font-bold h-12 px-6 hover:bg-slate-50 transition-all gap-2">
                            <FileDown size={18} />
                            Download Report
                        </Button>
                        <Button className="bg-blue-600 hover:bg-blue-500 rounded-2xl font-bold h-12 px-6 shadow-xl shadow-blue-500/20 transition-all text-white border-0">
                            <Plus size={18} className="mr-2" />
                            New Booking
                        </Button>
                    </div>
                }
            />

            {/* Main Stats Grid */}
            <StatsGrid liveStats={liveStats} />

            {/* Financial Performance Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                    <RevenueChart data={revenueTrend} />
                </div>
                <div className="lg:col-span-1">
                    <ConversionFunnel data={conversionFunnel} />
                </div>
            </div>

            {/* Growth & Distribution Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1">
                    <TopRoutes routes={topRoutes} />
                </div>
                {/* Existing Supplier Breakdown */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.4 }}
                    className="lg:col-span-1 bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 p-8 rounded-[2rem] shadow-xl flex flex-col"
                >
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-xl font-black text-slate-900 dark:text-white">Supplier Breakdown</h3>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                                {graphType === 'market' ? 'Market Distribution' : graphType === 'volume' ? 'Booking Volume' : 'Distribution List'}
                            </p>
                        </div>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-all">
                                    <MoreHorizontal size={20} />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="rounded-2xl border-slate-100 dark:border-white/10 dark:bg-obsidian p-2 shadow-2xl">
                                <DropdownMenuItem onClick={() => setGraphType('market')} className="text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer">Donut Chart</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setGraphType('volume')} className="text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer">Bar Comparison</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setGraphType('list')} className="text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer">Detailed List</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    <div className="flex-1 flex flex-col items-center justify-center py-4">
                        {graphType === 'market' && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="w-full flex flex-col items-center"
                            >
                                <div className="relative w-48 h-48 mb-10 flex items-center justify-center">
                                    <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                                        <circle cx="50" cy="50" r="40" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-slate-100 dark:text-white/5" />
                                        {supplierBreakdown.reduce((acc, item, i) => {
                                            const circumference = 2 * Math.PI * 40;
                                            const offset = (acc.total / 100) * circumference;
                                            const dashLength = (item.value / 100) * circumference;

                                            acc.elements.push(
                                                <motion.circle
                                                    key={i}
                                                    cx="50"
                                                    cy="50"
                                                    r="40"
                                                    stroke="currentColor"
                                                    strokeWidth="12"
                                                    strokeDasharray={`${dashLength} ${circumference}`}
                                                    strokeDashoffset={-offset}
                                                    fill="transparent"
                                                    className={`${item.color}`}
                                                    initial={{ strokeDasharray: `0 ${circumference}` }}
                                                    animate={{ strokeDasharray: `${dashLength} ${circumference}` }}
                                                    transition={{ duration: 1.5, delay: 0.5 + i * 0.1, ease: "easeInOut" }}
                                                />
                                            );
                                            acc.total += item.value;
                                            return acc;
                                        }, { total: 0, elements: [] as React.ReactNode[] }).elements}
                                    </svg>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <span className="text-3xl font-black dark:text-white">100%</span>
                                        <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Global</span>
                                    </div>
                                </div>

                                <div className="w-full grid grid-cols-2 gap-y-4 gap-x-6">
                                    {supplierBreakdown.map((item, i) => (
                                        <div key={i} className="flex items-center gap-3">
                                            <div className={`w-3 h-3 rounded-full ${item.bg}`} />
                                            <div className="flex flex-col">
                                                <span className="text-xs font-black text-slate-900 dark:text-white">{item.name}</span>
                                                <span className="text-[10px] font-bold text-slate-400">{item.value}% Share</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}

                        {graphType === 'volume' && (
                            <motion.div
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="w-full space-y-8 py-6"
                            >
                                {supplierBreakdown.filter(i => i.count > 0 || i.name !== 'Other').map((item, i) => (
                                    <div key={i} className="space-y-3">
                                        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                                            <span className="text-slate-900 dark:text-white">{item.name}</span>
                                            <span className="text-slate-400">{item.count} Bookings</span>
                                        </div>
                                        <div className="h-3 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${(item.count / Math.max(...supplierBreakdown.map(b => b.count), 1)) * 100}%` }}
                                                transition={{ duration: 1, delay: i * 0.1 }}
                                                className={`h-full ${item.bg} rounded-full`}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </motion.div>
                        )}

                        {graphType === 'list' && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="w-full divide-y divide-slate-100 dark:divide-white/5"
                            >
                                {supplierBreakdown.filter(i => i.count > 0 || i.name !== 'Other').map((item, i) => (
                                    <div key={i} className="py-4 flex items-center justify-between group cursor-default">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-10 h-10 rounded-xl ${item.bg}/10 flex items-center justify-center transition-transform group-hover:scale-110 shadow-sm border border-transparent group-hover:border-${item.color.split('-')[1]}-500/20`}>
                                                <Activity size={18} className={item.color} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-slate-900 dark:text-white">{item.name}</p>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Supplier</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-black text-slate-900 dark:text-white">{item.value}%</p>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.count} Bookings</p>
                                        </div>
                                    </div>
                                ))}
                            </motion.div>
                        )}
                    </div>
                </motion.div>

                {/* Grow Your Business Card */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.7 }}
                    className="bg-blue-600 rounded-[2.5rem] p-8 text-white shadow-2xl shadow-blue-500/20 flex flex-col justify-between overflow-hidden relative group"
                >
                    <div className="relative z-10">
                        <TrendingUp size={32} className="mb-4 text-blue-200" />
                        <h4 className="text-2xl font-black tracking-tight mb-2">Grow Your Business</h4>
                        <p className="text-sm text-blue-100 font-medium">Get advanced insights and automated booking reports with our Premium tier.</p>
                    </div>
                    <Button className="relative z-10 w-full bg-white text-blue-600 hover:bg-blue-50 font-black rounded-2xl h-12 mt-6">
                        Upgrade Now
                    </Button>
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 blur-3xl rounded-full -mr-16 -mt-16 pointer-events-none group-hover:scale-150 transition-transform duration-700" />
                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-blue-900/20 blur-2xl rounded-full -ml-12 -mb-12 pointer-events-none" />
                </motion.div>
            </div>

            {/* Platform Activity & Insights Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Recent Activity Feed (Now 2 cols) */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="lg:col-span-2 bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 p-8 rounded-[2rem] shadow-xl flex flex-col"
                >
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-xl font-black text-slate-900 dark:text-white">Recent Activity</h3>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Live Transaction Hub</p>
                        </div>
                        <Button asChild variant="ghost" className="text-blue-600 font-black text-xs uppercase tracking-widest hover:bg-blue-500/5 group">
                            <Link href="/admin/bookings">
                                View All <ArrowRight size={14} className="ml-1 group-hover:translate-x-1 transition-transform" />
                            </Link>
                        </Button>
                    </div>

                    <div className="flex-1 space-y-6">
                        {recentActivity.length > 0 ? recentActivity.map((activity, i) => (
                            <motion.div
                                key={activity.id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.6 + (i * 0.1) }}
                                className="flex items-center gap-5 p-2 rounded-2xl hover:bg-slate-50 dark:hover:bg-white/5 transition-all group "
                            >
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border border-transparent transition-all group-hover:scale-110 ${activity.type === 'flight' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400' :
                                    activity.type === 'hotel' ? 'bg-blue-50 text-blue-500 dark:bg-blue-900/20 dark:text-blue-300' :
                                        activity.type === 'cancel' ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400' :
                                            'bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-400'
                                    }`}>
                                    {activity.type === 'flight' ? <Plane size={20} /> :
                                        activity.type === 'hotel' ? <Building2 size={20} /> :
                                            <XCircle size={20} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-1">
                                        <p className="text-sm font-black text-slate-900 dark:text-white truncate">
                                            {activity.user}
                                        </p>
                                        <span className="text-[10px] text-slate-400 font-bold">{activity.time}</span>
                                    </div>
                                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 truncate">
                                        {activity.action}
                                    </p>
                                </div>
                                <div className={`text-sm font-black px-4 py-2 rounded-xl ${activity.amount.startsWith('-') ? 'text-rose-500 bg-rose-500/5' : 'text-blue-600 bg-blue-500/5'
                                    }`}>
                                    {activity.amount}
                                </div>
                            </motion.div>
                        )) : (
                            <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                <Activity size={48} className="mb-4 opacity-20" />
                                <p className="text-sm font-bold uppercase tracking-widest">No recent activity</p>
                            </div>
                        )}
                    </div>

                    <Button asChild variant="ghost" className="w-full mt-8 pt-8 text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] border-t border-slate-100 dark:border-white/5 hover:bg-transparent hover:text-blue-600 transition-colors">
                        <Link href="/admin/bookings">
                            Enter Bookings Page
                        </Link>
                    </Button>
                </motion.div>

                {/* Project Analytics (Formerly a large section, now 1 col) */}
                <div className="lg:col-span-1">
                    <ProjectAnalytics data={analytics} />
                </div>
            </div>
        </div>
    );
}
