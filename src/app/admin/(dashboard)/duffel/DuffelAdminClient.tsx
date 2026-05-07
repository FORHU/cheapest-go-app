"use client";

import React, { useState, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Plane, ExternalLink,
    CheckCircle2, Clock, XCircle, ChevronDown, ChevronUp,
    AlertTriangle, Filter, ArrowUpDown, MapPin, Search,
    Star, Briefcase, Tag, MoreHorizontal
} from 'lucide-react';
import type {
    DuffelProviderData, DuffelOrder,
    DuffelAirlineMetric, DuffelRouteMetric,
    DuffelAirline
} from '@/types/admin';

import { DuffelInsightsCharts } from '@/components/admin/dashboard/DuffelInsightsCharts';

interface Props { 
    data: DuffelProviderData; 
    airlines: DuffelAirline[];
}

// ─── Helpers ───────────────────────────────────────────────

function fmtCurrency(value: number, currency: string) {
    return value.toLocaleString('en-US', { style: 'currency', currency, maximumFractionDigits: 2 });
}

// ─── Airline Logo Component ────────────────────────────────

const AirlineLogo = memo(({ iataCode, name, logoUrl, size = "w-5 h-5" }: { iataCode?: string | null; name: string; logoUrl?: string | null; size?: string }) => {
    const [stage, setStage] = useState(0);
    const [isError, setIsError] = useState(false);

    const getUrl = (s: number) => {
        if (!iataCode) return null;
        const code = iataCode.toUpperCase();
        if (s === 0) return logoUrl;
        if (s === 1) return `https://www.gstatic.com/flights/airline_logos/70px/${code}.png`;
        if (s === 2) return `https://logos.skyscnr.com/images/airlines/favicon/${code}.png`;
        return null;
    };

    const currentUrl = getUrl(stage);

    if (!iataCode || isError || !currentUrl) return <Plane size={16} className="text-slate-300" />;

    return (
        <img 
            src={currentUrl} 
            alt={name} 
            className={`${size} object-contain filter dark:brightness-0 dark:invert`}
            onError={() => stage < 2 ? setStage(s => s + 1) : setIsError(true)}
        />
    );
});

AirlineLogo.displayName = 'AirlineLogo';

// ... (AirlineTable, StatusBadge, OrdersTable components preserved) ...
const AirlineTable = memo(({ airlines, mode, currency }: { airlines: DuffelAirlineMetric[]; mode: 'volume' | 'value'; currency: string }) => {
    return (
        <div className="space-y-4">
            {airlines.map((a, i) => (
                <div key={a.iataCode || a.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black text-slate-300 w-4">{i + 1}.</span>
                        <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-white/5 flex items-center justify-center overflow-hidden border border-slate-100 dark:border-white/5">
                            <AirlineLogo iataCode={a.iataCode} name={a.name} logoUrl={null} size="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{a.name}</p>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{a.iataCode || '—'}</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-sm font-black text-slate-900 dark:text-white">{mode === 'volume' ? a.count : a.value}</p>
                        <span className="w-32 justify-center text-center whitespace-nowrap inline-flex text-[10px] font-medium text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">Active</span>
                    </div>
                </div>
            ))}
        </div>
    );
});

const StatusBadge = memo(({ status }: { status: DuffelOrder['status'] }) => {
    const cfg = {
        confirmed: { label: 'Confirmed', cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', icon: CheckCircle2 },
        cancelled: { label: 'Cancelled', cls: 'bg-rose-500/10 text-rose-500 border-rose-500/20', icon: XCircle },
        awaiting_payment: { label: 'Pending', cls: 'bg-amber-500/10 text-amber-600 border-amber-500/20', icon: Clock },
    } as const;
    const { label, cls, icon: Icon } = cfg[status] || cfg.confirmed;
    return (
        <span className={`w-32 justify-center text-center whitespace-nowrap inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-medium ${cls}`}>
            <Icon size={9} className="shrink-0" />{label}
        </span>
    );
});

const OrdersTable = memo(({ orders }: { orders: DuffelOrder[] }) => {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-white/3 text-left">
                    <tr>
                        <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400">Reference</th>
                        <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400">Passenger</th>
                        <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400">Route</th>
                        <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400">Status</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                    {orders.map(o => (
                        <tr key={o.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                            <td className="px-4 py-3 font-mono text-[11px] font-bold text-blue-600">{o.bookingReference}</td>
                            <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-100">{o.passengerName}</td>
                            <td className="px-4 py-3 text-xs font-black">{o.origin} → {o.destination}</td>
                            <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
});

// ─── Airlines Grid (Pixel Perfect Restructure) ─────────────

const AirlinesGrid = memo(({ airlines }: { airlines: DuffelAirline[] }) => {
    const [search, setSearch] = useState('');
    const [activeTab, setActiveTab] = useState<'all' | 'active' | 'inactive'>('all');

    const filtered = useMemo(() => airlines.filter(a => {
        if (activeTab === 'active') return a.active;
        if (activeTab === 'inactive') return !a.active;
        return true;
    }).filter(a => {
        if (!search) return true;
        const q = search.toLowerCase();
        return a.name.toLowerCase().includes(q) || a.iataCode?.toLowerCase().includes(q);
    }), [airlines, search, activeTab]);

    return (
        <div className="space-y-8">
            {/* 1. Directory Label (Matching Screenshot) */}
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
                    Carrier Directory — Global Network
                </h2>
                <ChevronUp size={16} className="text-slate-400" />
            </div>

            {/* 2. Control Bar (Matching Screenshot) */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/5 p-1 rounded-xl w-fit border border-slate-200/50 dark:border-white/5">
                    {(['all', 'active', 'inactive'] as const).map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)}
                            className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                activeTab === tab 
                                    ? 'bg-white dark:bg-obsidian text-blue-600 shadow-sm border border-slate-100 dark:border-white/10' 
                                    : 'text-slate-400 hover:text-slate-600'
                            }`}>
                            {tab}
                        </button>
                    ))}
                </div>
                <div className="relative flex-1 max-w-[360px] group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors">
                        <Search size={16} />
                    </div>
                    <input 
                        type="text" 
                        value={search} 
                        onChange={e => setSearch(e.target.value)} 
                        placeholder="Search airlines..."
                        className="w-full pl-12 pr-4 py-3 bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 rounded-2xl text-xs outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 transition-all font-medium placeholder:text-slate-300" 
                    />
                </div>
            </div>

            {/* 3. Grid (Matching Screenshot) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filtered.map(a => (
                    <div key={a.id} className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 rounded-3xl p-6 hover:shadow-xl hover:shadow-slate-200/20 dark:hover:shadow-none transition-all group flex flex-col h-[240px] relative overflow-hidden">
                        {/* Background subtle flare */}
                        <div className="absolute -top-12 -right-12 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-colors" />

                        <div className="flex-1 relative z-10">
                            {/* Card Header: Logo left, Badge right */}
                            <div className="flex items-start justify-between mb-6">
                                <div className="w-14 h-14 rounded-2xl bg-slate-50 dark:bg-white/5 flex items-center justify-center overflow-hidden border border-slate-100 dark:border-white/10 group-hover:scale-105 transition-transform duration-500">
                                    <AirlineLogo iataCode={a.iataCode} name={a.name} logoUrl={a.logoUrl} size="w-10 h-10" />
                                </div>
                                <div className={`w-32 justify-center text-center whitespace-nowrap flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${
                                    a.active 
                                        ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' 
                                        : 'bg-slate-100 text-slate-400'
                                }`}>
                                    {a.active ? 'Active' : 'Inactive'}
                                </div>
                            </div>

                            {/* Card Body */}
                            <h3 className="font-black text-slate-900 dark:text-white text-base leading-tight mb-2 truncate group-hover:text-blue-600 transition-colors">
                                {a.name}
                            </h3>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-white/5 px-2 py-0.5 rounded-md border border-slate-100 dark:border-white/10">
                                    {a.iataCode || '??'}
                                </span>
                                <span className="text-slate-200 dark:text-white/10">•</span>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    {a.region || 'Global'}
                                </span>
                            </div>
                        </div>

                        {/* Card Footer: Icons left, Menu right */}
                        <div className="pt-6 border-t border-slate-50 dark:border-white/5 flex items-center justify-between relative z-10">
                            <div className="flex gap-4">
                                <div className="text-slate-300 hover:text-amber-500 transition-colors cursor-pointer">
                                    <Star size={16} />
                                </div>
                                <div className="text-slate-300 hover:text-blue-500 transition-colors cursor-pointer">
                                    <Briefcase size={16} />
                                </div>
                                <div className="text-slate-300 hover:text-emerald-500 transition-colors cursor-pointer">
                                    <Tag size={16} />
                                </div>
                            </div>
                            <div className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-slate-600 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-all">
                                <MoreHorizontal size={18} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
});

AirlinesGrid.displayName = 'AirlinesGrid';

// ─── Section wrapper ───────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="space-y-6">
            {children}
        </section>
    );
}

// ─── Main Client ───────────────────────────────────────────

export function DuffelAdminClient({ data, airlines }: Props) {
    const [view, setView] = useState<'insights' | 'airlines'>('insights');
    const cur = data.orderCurrency || 'USD';

    return (
        <div className="pt-12 space-y-12 pb-20 w-full">
            <div className="flex items-center justify-end gap-2 mb-8">
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/5 p-1 rounded-xl mr-4 border border-slate-200/50 dark:border-white/5 shadow-sm">
                    <button onClick={() => setView('insights')}
                        className={`px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                            view === 'insights' ? 'bg-white dark:bg-obsidian text-blue-600 shadow-sm' : 'text-slate-500'
                        }`}>
                        Dashboard
                    </button>
                    <button onClick={() => setView('airlines')}
                        className={`px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                            view === 'airlines' ? 'bg-white dark:bg-obsidian text-blue-600 shadow-sm' : 'text-slate-500'
                        }`}>
                        Carriers
                    </button>
                </div>
                <a href="https://app.duffel.com" target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-blue-500/20 border-0">
                    <ExternalLink size={14} /> Duffel Portal
                </a>
            </div>

            {data.status !== 'healthy' && (
                <div className="flex items-start gap-4 p-6 rounded-3xl border bg-rose-500/5 border-rose-500/20">
                    <AlertTriangle size={24} className="text-rose-500 shrink-0" />
                    <div>
                        <p className="font-black text-sm text-slate-900 dark:text-white mb-0.5">Integration Issue Detected</p>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{data.errorMessage}</p>
                    </div>
                </div>
            )}

            <AnimatePresence mode="wait">
                {view === 'insights' ? (
                    <motion.div key="insights" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }} className="space-y-16">
                        <Section title="Insights">
                            {data.dailyOrdersChart.length > 0 ? (
                                <DuffelInsightsCharts
                                    data={data.dailyOrdersChart}
                                    currency={cur}
                                    ordersCancelled={data.ordersCancelled ?? 0}
                                    ordersChanged={data.ordersChanged ?? 0}
                                    ancillariesSold={data.ancillariesSold ?? 0}
                                    grossAncillaryVolume={data.grossAncillaryVolume ?? 0}
                                    ancillaryAttachmentRate={data.ancillaryAttachmentRate ?? 0}
                                />
                            ) : <div className="text-center py-20 bg-slate-50 dark:bg-white/3 rounded-3xl border border-dashed border-slate-200 dark:border-white/10 text-slate-400 font-bold uppercase tracking-widest text-[10px]">No sales data found for the last 30 days</div>}
                        </Section>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 rounded-3xl p-8">
                                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 mb-8">Top Carriers by Volume</h3>
                                <AirlineTable airlines={data.topAirlinesByVolume} mode="volume" currency={cur} />
                            </div>
                            <div className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 rounded-3xl p-8">
                                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 mb-8">Recent Flight Orders</h3>
                                <OrdersTable orders={data.recentOrders} />
                            </div>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div key="airlines" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
                        <AirlinesGrid airlines={airlines} />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
