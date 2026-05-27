"use client";

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    DollarSign, XCircle, Building2, Plane, Activity, 
    MoreHorizontal, TrendingUp, FileDown, ArrowRight, 
    Coins, Banknote, ChevronDown, ChevronUp, RefreshCw,
    Users, Briefcase, Globe, Zap, Clock
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ProjectAnalytics } from '@/components/admin/ProjectAnalytics';
import { Button } from '@/components/ui/Button';
import { StatCard } from '@/components/admin/StatCard';
import { formatCurrency } from '@/lib/utils';
import { convertCurrency } from '@/lib/currency';
import { useUserCurrency } from '@/stores/searchStore';
import type { DashboardData } from '@/types/admin';

import { RevenueChart } from '@/components/admin/dashboard/RevenueChart';
import { ConversionFunnel } from '@/components/admin/dashboard/ConversionFunnel';
import { TopRoutes } from '@/components/admin/dashboard/TopRoutes';
import { ProviderIntegrations } from '@/components/admin/dashboard/ProviderIntegrations';
import { DuffelDashboard } from '@/components/admin/dashboard/DuffelDashboard';

interface AdminDashboardClientProps {
    data: DashboardData;
}

export default function AdminDashboardClient({ data }: AdminDashboardClientProps) {
    const {
        stats: liveStats,
        recentActivity,
        analytics,
        supplierBreakdown,
        revenueTrend,
        conversionFunnel,
        topRoutes,
        revenueStats,
        providerIntegrations,
        defaultCurrency
    } = data;

    const userCurrency = useUserCurrency();
    const activeCurrency = defaultCurrency || userCurrency || 'PHP';
    const [isProvidersCollapsed, setIsProvidersCollapsed] = useState(false);

    const topMetrics = useMemo(() => [
        { label: 'Total Bookings', value: liveStats.totalBookings.toString(), trend: 'Successful orders', icon: Briefcase, variant: 'blue' as const },
        { label: 'Revenue', value: formatCurrency(convertCurrency(liveStats.revenue, 'PHP', activeCurrency), activeCurrency), trend: 'Gross volume', icon: DollarSign, variant: 'white' as const },
        { label: 'Pending Bookings', value: liveStats.pendingBookings.toString(), trend: 'Awaiting sync', icon: Clock, variant: 'white' as const },
        { label: 'Cancelled', value: liveStats.cancelledBookings.toString(), trend: 'Voided orders', icon: XCircle, variant: 'white' as const },
    ], [liveStats, activeCurrency]);

    const financialMetrics = useMemo(() => [
        { label: 'Daily Revenue', value: formatCurrency(convertCurrency(revenueStats.dailyRevenue, 'PHP', activeCurrency), activeCurrency), trend: 'Today', icon: DollarSign, variant: 'white' as const },
        { label: 'Monthly Revenue', value: formatCurrency(convertCurrency(revenueStats.monthlyRevenue, 'PHP', activeCurrency), activeCurrency), trend: 'This month', icon: TrendingUp, variant: 'white' as const },
        { label: 'Total Markup', value: formatCurrency(convertCurrency(revenueStats.totalMarkup, 'PHP', activeCurrency), activeCurrency), trend: 'Gross gain', icon: Banknote, variant: 'amber' as const },
        { label: 'Total Profit', value: formatCurrency(convertCurrency(revenueStats.totalProfit, 'PHP', activeCurrency), activeCurrency), trend: 'Total net', icon: Coins, variant: 'emerald' as const },
    ], [revenueStats, activeCurrency]);

    return (
        <div className="pt-8 space-y-12 pb-20 w-full px-4 lg:px-8">
            <div className="flex items-center justify-end">
                <Button variant="outline" className="bg-blue-600 hover:bg-blue-500 rounded-xl font-black text-[10px] uppercase tracking-widest h-10 px-6 text-white border-0 shadow-lg shadow-blue-500/20">
                    <FileDown size={14} className="mr-2" /> Export
                </Button>
            </div>

            {/* ── Overview Section ─────────────────────────────── */}
            <section className="space-y-6">
                <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Overview</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {topMetrics.map((m, i) => (
                        <StatCard key={m.label} title={m.label} value={m.value} icon={m.icon} trend={m.trend} variant={m.variant} />
                    ))}
                </div>
            </section>

            {/* ── Financial Metrics Section ────────────────────── */}
            <section className="space-y-6">
                <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Financial Metrics</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {financialMetrics.map((m, i) => (
                        <StatCard key={m.label} title={m.label} value={m.value} icon={m.icon} trend={m.trend} variant={m.variant} />
                    ))}
                </div>
            </section>

            <div className="grid grid-cols-12 gap-8 pt-4">
                {/* Top Row: Revenue Trend (Left) & Funnel/Split (Right) */}
                <div className="col-span-12 lg:col-span-8">
                    <div className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 rounded-3xl p-8 shadow-sm h-full">
                        <RevenueChart data={revenueTrend} defaultCurrency={activeCurrency} />
                    </div>
                </div>

                <div className="col-span-12 lg:col-span-4 flex flex-col gap-8">
                    <div className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 rounded-3xl p-8 shadow-sm flex-1 min-h-0 flex flex-col">
                        <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4">Sales Funnel</h2>
                        <div className="flex-1 flex flex-col justify-center">
                            <ConversionFunnel data={conversionFunnel} />
                        </div>
                    </div>
                    <div className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 rounded-3xl p-8 shadow-sm flex-1 min-h-0 flex flex-col">
                        <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4">Supplier Split</h2>
                        <div className="flex-1 flex flex-col justify-center">
                            <div className="space-y-4">
                                {supplierBreakdown.slice(0, 3).map((item, i) => (
                                    <div key={i} className="space-y-2">
                                        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                                            <span className="text-slate-400">{item.name}</span>
                                            <span className="text-slate-900 dark:text-white">{item.value}%</span>
                                        </div>
                                        <div className="h-1.5 bg-slate-50 dark:bg-white/5 rounded-full overflow-hidden">
                                            <motion.div initial={{ width: 0 }} animate={{ width: `${item.value}%` }} transition={{ duration: 1 }} className={`h-full ${item.bg}`} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom Row: Recent Transactions */}
                <div className="col-span-12">
                    <div className="space-y-6">
                        <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Recent Transactions</h2>
                        <div className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 rounded-3xl p-8 shadow-sm">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {recentActivity.slice(0, 6).map((activity) => (
                                    <div key={activity.id} className="flex items-center gap-4 p-4 rounded-2xl hover:bg-slate-50 dark:hover:bg-white/5 transition-all border border-slate-50 dark:border-white/5">
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${activity.type === 'flight' ? 'bg-blue-500/10 text-blue-600' : 'bg-emerald-500/10 text-emerald-600'}`}>
                                            {activity.type === 'flight' ? <Plane size={20} /> : <Building2 size={20} />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-black text-slate-900 dark:text-white truncate">{activity.user}</p>
                                            <p className="text-xs font-bold text-slate-400 truncate">{activity.action}</p>
                                        </div>
                                        <p className="text-sm font-black text-slate-900 dark:text-white">{activity.amount}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>


            {/* ── Integration Shelf ─────────────────────────────── */}
            <section className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Integrations</h2>
                    <button onClick={() => setIsProvidersCollapsed(!isProvidersCollapsed)} className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-all">
                        {isProvidersCollapsed ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
                    </button>
                </div>
                <AnimatePresence>
                    {!isProvidersCollapsed && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-12 overflow-hidden">
                            <ProviderIntegrations data={providerIntegrations} />
                            <div className="space-y-6">
                                <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Duffel Hub</h2>
                                <div className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 rounded-3xl p-8 shadow-sm">
                                    <DuffelDashboard data={providerIntegrations.duffel} />
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </section>
        </div>
    );
}
