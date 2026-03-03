"use client";

import React from 'react';
import { motion } from 'framer-motion';
import {
    CalendarCheck,
    DollarSign,
    Clock,
    XCircle,
    ArrowUpRight,
    Building2,
    Plane,
    Activity,
    MoreHorizontal,
    TrendingUp,
    CheckCircle2,
    Plus,
    FileDown,
    ArrowRight
} from 'lucide-react';
import { ProjectAnalytics } from '@/components/admin/ProjectAnalytics';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/utils';
import { useDashboardData } from '@/hooks/admin/useDashboardData';

export default function AdminDashboardPage() {
    const { stats: liveStats, recentActivity: liveActivity, isLoading } = useDashboardData();

    const stats = [
        {
            title: 'Total Bookings',
            value: liveStats?.totalBookings.toLocaleString() || '0',
            icon: CalendarCheck,
            trend: '+12.5%',
            color: 'blue'
        },
        {
            title: 'Revenue',
            value: formatCurrency(liveStats?.revenue || 0),
            icon: DollarSign,
            trend: '+8.4%',
            color: 'white'
        },
        {
            title: 'Pending Bookings',
            value: liveStats?.pendingBookings.toLocaleString() || '0',
            icon: Clock,
            trend: '-2.1%',
            color: 'white'
        },
        {
            title: 'Cancelled',
            value: liveStats?.cancelledBookings.toLocaleString() || '0',
            icon: XCircle,
            trend: '-0.5%',
            color: 'white'
        },
    ];

    const supplierBreakdown = [
        { name: 'Hotels', value: 45, color: 'text-blue-600', bg: 'bg-blue-600' },
        { name: 'Flights', value: 35, color: 'text-blue-400', bg: 'bg-blue-400' },
        { name: 'Tours', value: 15, color: 'text-blue-200', bg: 'bg-blue-200' },
        { name: 'Other', value: 5, color: 'text-slate-400', bg: 'bg-slate-400' },
    ];

    const recentActivity = liveActivity || [];

    return (
        <div className="space-y-10 pb-20">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
                <div className="space-y-1.5 focus:outline-none">
                    <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">Dashboard</h1>
                    <p className="text-slate-400 font-bold text-sm uppercase tracking-widest flex items-center gap-2">
                        <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                        Platform Performance Overview
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="outline" className="rounded-2xl border-slate-200 dark:border-white/10 dark:bg-white/5 font-bold h-12 px-6 hover:bg-slate-50 transition-all gap-2">
                        <FileDown size={18} />
                        Export
                    </Button>
                    <Button className="rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black h-12 px-6 shadow-xl shadow-blue-600/20 transition-all gap-2">
                        <Plus size={20} />
                        Add Booking
                    </Button>
                </div>
            </div>

            {/* Main Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.map((stat, i) => (
                    <motion.div
                        key={stat.title}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className={`p-8 rounded-[2rem] relative overflow-hidden group border transition-all duration-500 ${stat.color === 'blue'
                            ? 'bg-blue-600 border-blue-500 text-white shadow-2xl shadow-blue-500/30'
                            : 'bg-white dark:bg-obsidian border-slate-100 dark:border-white/10 shadow-xl'
                            }`}
                    >
                        <div className="relative z-10 flex flex-col h-full justify-between gap-8">
                            <div className="flex items-start justify-between">
                                <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${stat.color === 'blue' ? 'text-blue-200' : 'text-slate-400'}`}>
                                    {stat.title}
                                </span>
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${stat.color === 'blue' ? 'bg-white/10' : 'bg-slate-100 dark:bg-white/5 text-slate-400 group-hover:text-blue-500'} transition-colors`}>
                                    <stat.icon size={18} />
                                </div>
                            </div>
                            <div>
                                <h3 className="text-4xl font-black tracking-tighter mb-1">{stat.value}</h3>
                                <div className="flex items-center gap-2 font-black text-[10px] uppercase tracking-wider">
                                    <TrendingUp size={12} className={stat.color === 'blue' ? 'text-blue-300' : 'text-blue-500'} />
                                    <span className={stat.color === 'blue' ? 'text-blue-100' : 'text-slate-500'}>
                                        {stat.trend} <span className="opacity-60 ml-0.5">Performance</span>
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Background Decoration */}
                        {stat.color === 'blue' ? (
                            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 blur-3xl rounded-full -mr-16 -mt-16 pointer-events-none" />
                        ) : (
                            <div className="absolute -bottom-10 -right-10 w-24 h-24 bg-blue-500/5 blur-2xl rounded-full pointer-events-none group-hover:bg-blue-500/10 transition-colors" />
                        )}
                    </motion.div>
                ))}
            </div>

            {/* Content Sections */}
            {/* Dashboard Content Row 1: Supplier & Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Supplier Breakdown */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.4 }}
                    className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 p-8 rounded-[2rem] shadow-xl flex flex-col"
                >
                    <div className="flex items-center justify-between mb-10">
                        <div>
                            <h3 className="text-xl font-black text-slate-900 dark:text-white">Supplier Breakdown</h3>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Market Distribution</p>
                        </div>
                        <Button variant="ghost" size="icon" className="text-slate-400"><MoreHorizontal size={20} /></Button>
                    </div>

                    <div className="flex-1 flex flex-col items-center justify-center py-4">
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
                    </div>
                </motion.div>

                {/* Recent Activity Feed */}
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
                        <Button variant="ghost" className="text-blue-600 font-black text-xs uppercase tracking-widest hover:bg-blue-500/5 group">
                            View All <ArrowRight size={14} className="ml-1 group-hover:translate-x-1 transition-transform" />
                        </Button>
                    </div>

                    <div className="flex-1 space-y-6">
                        {recentActivity.map((activity, i) => (
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
                        ))}
                    </div>

                    <Button variant="ghost" className="w-full mt-8 pt-8 text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] border-t border-slate-100 dark:border-white/5 hover:bg-transparent hover:text-blue-600 transition-colors">
                        Enter Transaction Archive
                    </Button>
                </motion.div>
            </div>

            {/* Analytics Section Row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                    <ProjectAnalytics />
                </div>
                {/* Secondary Call to Action or Info card could go here, for now keeping it as 2/3 - 1/3 layout */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.7 }}
                    className="bg-blue-600 rounded-[2rem] p-8 text-white shadow-xl shadow-blue-500/20 flex flex-col justify-between overflow-hidden relative group"
                >
                    <div className="relative z-10">
                        <TrendingUp size={32} className="mb-4 text-blue-200" />
                        <h4 className="text-2xl font-black tracking-tight mb-2">Grow Your Business</h4>
                        <p className="text-sm text-blue-100 font-medium">Get advanced insights and automated booking reports with our Premium tier.</p>
                    </div>
                    <Button className="relative z-10 w-full bg-white text-blue-600 hover:bg-blue-50 font-black rounded-2xl h-12 mt-6">
                        Upgrade Now
                    </Button>
                    {/* Decorative blobs */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 blur-3xl rounded-full -mr-16 -mt-16 pointer-events-none group-hover:scale-150 transition-transform duration-700" />
                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-blue-900/20 blur-2xl rounded-full -ml-12 -mb-12 pointer-events-none" />
                </motion.div>
            </div>
        </div>
    );
}
