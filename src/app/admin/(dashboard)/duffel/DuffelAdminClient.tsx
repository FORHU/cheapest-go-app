"use client";

import React, { useState, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Plane, ExternalLink,
    CheckCircle2, Clock, XCircle, ChevronDown, ChevronUp,
    AlertTriangle, Filter, ArrowUpDown, MapPin,
} from 'lucide-react';
import type {
    DuffelProviderData, DuffelOrder,
    DuffelAirlineMetric, DuffelRouteMetric,
} from '@/types/admin';
import { HeaderTitle } from '@/components/admin/HeaderTitle';
import { DuffelInsightsCharts } from '@/components/admin/dashboard/DuffelInsightsCharts';

interface Props { data: DuffelProviderData; }

// ─── Helpers ───────────────────────────────────────────────

function fmtCurrency(value: number, currency: string) {
    return value.toLocaleString('en-US', { style: 'currency', currency, maximumFractionDigits: 2 });
}

function fmtShort(value: number, currency: string) {
    return value.toLocaleString('en-US', { style: 'currency', currency, maximumFractionDigits: 0 });
}

// ─── Stat Card ─────────────────────────────────────────────

const StatCard = memo(({ icon: Icon, label, value, sub, iconCls, delay = 0 }: {
    icon: React.ElementType; label: string; value: React.ReactNode;
    sub?: string; iconCls: string; delay?: number;
}) => {
    return (
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.35 }}
            className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 rounded-2xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${iconCls}`}>
                <Icon size={20} />
            </div>
            <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{label}</p>
                <p className="text-xl font-black text-slate-900 dark:text-white truncate">{value ?? '—'}</p>
                {sub && <p className="text-[11px] text-slate-400 font-medium mt-0.5">{sub}</p>}
            </div>
        </motion.div>
    );
});

StatCard.displayName = 'StatCard';


// ─── Top Airline Table ─────────────────────────────────────

const AirlineTable = memo(({ airlines, mode, currency }: {
    airlines: DuffelAirlineMetric[]; mode: 'volume' | 'value'; currency: string;
}) => {
    if (!airlines.length) return (
        <div className="flex flex-col items-center py-10 text-slate-400 opacity-40">
            <Plane size={32} className="mb-2" />
            <p className="text-xs font-bold uppercase tracking-widest">No airline data</p>
        </div>
    );
    const max = useMemo(() => mode === 'volume'
        ? Math.max(...airlines.map(a => a.count), 1)
        : Math.max(...airlines.map(a => a.value), 1), [airlines, mode]);

    return (
        <div className="space-y-4">
            {airlines.map((a, i) => {
                // Duffel logo URL pattern
                const logoUrl = a.iataCode ? `https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/${a.iataCode}.png` : null;

                return (
                    <div key={a.iataCode || a.name} className="group">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3 min-w-0">
                                <span className="text-[10px] font-black text-slate-300 dark:text-slate-600 w-4">{i + 1}.</span>
                                <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-white/5 flex items-center justify-center overflow-hidden border border-slate-100 dark:border-white/5 shrink-0">
                                    {logoUrl ? (
                                        <img src={logoUrl} alt={a.name} className="w-5 h-5 object-contain filter dark:brightness-0 dark:invert" onError={(e) => (e.currentTarget.style.display = 'none')} />
                                    ) : (
                                        <Plane size={14} className="text-slate-400" />
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate leading-tight">{a.name}</p>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{a.iataCode || '—'}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-black text-slate-900 dark:text-white">
                                    {mode === 'volume' ? a.count : fmtShort(a.value, currency)}
                                </p>
                                <div className="flex items-center justify-end gap-1">
                                    <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-500/10 px-1.5 py-0.5 rounded">Active</span>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
});

AirlineTable.displayName = 'AirlineTable';

// ─── Top Route Table ───────────────────────────────────────

const RouteTable = memo(({ routes, mode, currency }: {
    routes: DuffelRouteMetric[]; mode: 'volume' | 'value'; currency: string;
}) => {
    if (!routes.length) return (
        <div className="flex flex-col items-center py-10 text-slate-400 opacity-40">
            <MapPin size={32} className="mb-2" />
            <p className="text-xs font-bold uppercase tracking-widest">No route data</p>
        </div>
    );
    const max = useMemo(() => mode === 'volume'
        ? Math.max(...routes.map(r => r.count), 1)
        : Math.max(...routes.map(r => r.value), 1), [routes, mode]);

    return (
        <div className="space-y-4">
            {routes.map((r, i) => {
                return (
                    <div key={r.route} className="group">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                                <span className="text-[10px] font-black text-slate-300 dark:text-slate-600 w-4">{i + 1}.</span>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-black text-slate-900 dark:text-white">{r.origin}</span>
                                        <div className="w-4 h-[1px] bg-slate-200 dark:bg-white/10" />
                                        <span className="text-sm font-black text-slate-900 dark:text-white">{r.destination}</span>
                                    </div>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Direct Route</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-black text-slate-900 dark:text-white">
                                    {mode === 'volume' ? r.count : fmtShort(r.value, currency)}
                                </p>
                                <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest bg-blue-500/10 px-1.5 py-0.5 rounded">Primary</span>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
});

RouteTable.displayName = 'RouteTable';

// ─── Status Badge ──────────────────────────────────────────

const StatusBadge = memo(({ status }: { status: DuffelOrder['status'] }) => {
    const cfg = {
        confirmed:        { label: 'Confirmed',        cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20', icon: CheckCircle2 },
        cancelled:        { label: 'Cancelled',        cls: 'bg-rose-500/10 text-rose-500 border-rose-500/20',                                icon: XCircle },
        awaiting_payment: { label: 'Awaiting Payment', cls: 'bg-amber-500/10 text-amber-600 border-amber-500/20',                              icon: Clock },
    } as const;
    const { label, cls, icon: Icon } = cfg[status] || cfg.confirmed;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wider ${cls}`}>
            <Icon size={9} />{label}
        </span>
    );
});

StatusBadge.displayName = 'StatusBadge';

// ─── Orders Table ──────────────────────────────────────────

type SortKey = 'createdAt' | 'totalAmount' | 'departureDate';

const OrdersTable = memo(({ orders }: { orders: DuffelOrder[] }) => {
    const [sortKey, setSortKey] = useState<SortKey>('createdAt');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [filterStatus, setFilterStatus] = useState<DuffelOrder['status'] | 'all'>('all');
    const [search, setSearch] = useState('');

    const toggle = (key: SortKey) => {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('desc'); }
    };

    const filtered = useMemo(() => orders
        .filter(o => filterStatus === 'all' || o.status === filterStatus)
        .filter(o => {
            if (!search) return true;
            const q = search.toLowerCase();
            return o.passengerName.toLowerCase().includes(q)
                || o.bookingReference.toLowerCase().includes(q)
                || o.origin.toLowerCase().includes(q)
                || o.destination.toLowerCase().includes(q);
        })
        .sort((a, b) => {
            let av: number, bv: number;
            if (sortKey === 'totalAmount') { av = parseFloat(a.totalAmount); bv = parseFloat(b.totalAmount); }
            else if (sortKey === 'departureDate') { av = new Date(a.departureDate).getTime(); bv = new Date(b.departureDate).getTime(); }
            else { av = new Date(a.createdAt).getTime(); bv = new Date(b.createdAt).getTime(); }
            return sortDir === 'asc' ? av - bv : bv - av;
        }), [orders, sortKey, sortDir, filterStatus, search]);

    const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
        <button onClick={() => toggle(k)} className="flex items-center gap-1 group hover:text-blue-600 transition-colors">
            {label}
            <ArrowUpDown size={10} className={`transition-opacity ${sortKey === k ? 'opacity-100 text-blue-600' : 'opacity-0 group-hover:opacity-60'}`} />
        </button>
    );

    if (!orders.length) return (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 opacity-40">
            <Plane size={40} className="mb-3" /><p className="text-xs font-bold uppercase tracking-widest">No orders</p>
        </div>
    );

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-[200px]">
                    <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Search passenger, ref, route…"
                        className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-xl outline-none focus:border-blue-400 transition-colors placeholder:text-slate-400 font-medium text-slate-700 dark:text-white" />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {(['all', 'confirmed', 'cancelled', 'awaiting_payment'] as const).map(s => (
                        <button key={s} onClick={() => setFilterStatus(s)}
                            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${filterStatus === s ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-white/5 text-slate-500 hover:text-blue-600'}`}>
                            {s === 'all' ? 'All' : s === 'awaiting_payment' ? 'Pending' : s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-white/10">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-white/3">
                        <tr>
                            {[
                                { key: null,              label: 'Reference' },
                                { key: null,              label: 'Passenger' },
                                { key: null,              label: 'Route' },
                                { key: 'departureDate' as SortKey, label: 'Departure' },
                                { key: 'totalAmount'   as SortKey, label: 'Amount' },
                                { key: 'createdAt'     as SortKey, label: 'Booked' },
                                { key: null,              label: 'Status' },
                            ].map(({ key, label }) => (
                                <th key={label} className="text-left text-[9px] font-black uppercase tracking-widest text-slate-400 px-4 py-3">
                                    {key ? <SortBtn k={key} label={label} /> : label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-white/5 bg-white dark:bg-obsidian">
                        {filtered.length === 0 ? (
                            <tr><td colSpan={7} className="text-center py-10 text-slate-400 text-sm">No orders match your filters</td></tr>
                        ) : filtered.map((o, i) => {
                            const dep = o.departureDate ? new Date(o.departureDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—';
                            const booked = new Date(o.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
                            const amt = parseFloat(o.totalAmount).toLocaleString('en-US', { style: 'currency', currency: o.currency, maximumFractionDigits: 0 });
                            return (
                                <motion.tr key={o.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.025 }}
                                    className="hover:bg-slate-50 dark:hover:bg-white/3 transition-colors">
                                    <td className="px-4 py-3.5">
                                        <span className="font-mono text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/5 px-1.5 py-0.5 rounded">{o.bookingReference}</span>
                                    </td>
                                    <td className="px-4 py-3.5"><span className="font-bold text-slate-800 dark:text-slate-100 text-xs whitespace-nowrap">{o.passengerName}</span></td>
                                    <td className="px-4 py-3.5">
                                        <span className="text-xs font-black text-slate-700 dark:text-slate-200 whitespace-nowrap">
                                            {o.origin} <span className="text-slate-400 font-normal">→</span> {o.destination}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3.5"><span className="text-xs text-slate-500 whitespace-nowrap">{dep}</span></td>
                                    <td className="px-4 py-3.5"><span className="font-black text-xs text-slate-900 dark:text-white whitespace-nowrap">{amt}</span></td>
                                    <td className="px-4 py-3.5"><span className="text-xs text-slate-400 whitespace-nowrap">{booked}</span></td>
                                    <td className="px-4 py-3.5"><StatusBadge status={o.status} /></td>
                                </motion.tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <p className="text-[10px] text-slate-400 font-bold text-right">Showing {filtered.length} of {orders.length} orders (last 30 days)</p>
        </div>
    );
});

OrdersTable.displayName = 'OrdersTable';

// ─── Section wrapper ───────────────────────────────────────

function Section({ title, children, delay = 0 }: { title: string; children: React.ReactNode; delay?: number }) {
    const [open, setOpen] = useState(true);
    return (
        <section className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">{title}</h2>
                <button onClick={() => setOpen(v => !v)}
                    className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 transition-colors text-slate-400 flex items-center gap-2 group">
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">{open ? 'Collapse' : 'Expand'}</span>
                    {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
            </div>
            <AnimatePresence>
                {open && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.4, ease: 'circOut' }}
                        className="overflow-hidden">
                        {children}
                    </motion.div>
                )}
            </AnimatePresence>
        </section>
    );
}

// ─── Main page ─────────────────────────────────────────────

export function DuffelAdminClient({ data }: Props) {
    const cur = data.orderCurrency || 'USD';

    return (
        <div className="pt-12 space-y-12 pb-20">
            <HeaderTitle
                actions={
                    <a href="https://app.duffel.com" target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase tracking-widest transition-colors shadow-lg shadow-blue-500/20">
                        <ExternalLink size={14} /> Duffel Dashboard
                    </a>
                }
            />

            {/* Error / not configured banners */}
            {data.status !== 'healthy' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className={`flex items-start gap-4 p-5 rounded-2xl border ${data.status === 'error' ? 'bg-rose-500/5 border-rose-500/20' : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10'}`}>
                    <AlertTriangle size={20} className={data.status === 'error' ? 'text-rose-500 mt-0.5 shrink-0' : 'text-slate-400 mt-0.5 shrink-0'} />
                    <div>
                        <p className="font-black text-sm text-slate-900 dark:text-white mb-0.5">
                            {data.status === 'error' ? 'Duffel API Error' : 'Duffel Not Configured'}
                        </p>
                        <p className="text-xs font-medium text-slate-500">
                            {data.errorMessage || 'Add DUFFEL_ACCESS_TOKEN to your environment variables.'}
                        </p>
                    </div>
                </motion.div>
            )}

            {/* ── Insights — 2×2 chart grid matching Duffel dashboard ── */}
            <Section title="Insights — Last 30 Days">
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
                ) : (
                    <p className="text-sm text-slate-400 font-medium py-6 text-center">No chart data available</p>
                )}
            </Section>

            {/* ── Top Airlines ───────────────────────────────── */}
            <Section title="Top 5 Airlines">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                        className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 rounded-2xl p-6 shadow-sm">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">By Volume</p>
                        <AirlineTable airlines={data.topAirlinesByVolume} mode="volume" currency={cur} />
                    </motion.div>
                    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                        className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 rounded-2xl p-6 shadow-sm">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">By Value ({cur})</p>
                        <AirlineTable airlines={data.topAirlinesByValue} mode="value" currency={cur} />
                    </motion.div>
                </div>
            </Section>

            {/* ── Top Routes ──────────────────────────────────── */}
            <Section title="Top 5 Routes">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                        className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 rounded-2xl p-6 shadow-sm">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">By Volume</p>
                        <RouteTable routes={data.topRoutesByVolume} mode="volume" currency={cur} />
                    </motion.div>
                    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                        className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 rounded-2xl p-6 shadow-sm">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">By Value ({cur})</p>
                        <RouteTable routes={data.topRoutesByValue} mode="value" currency={cur} />
                    </motion.div>
                </div>
            </Section>

            {/* ── Orders Table ────────────────────────────────── */}
            <Section title="Recent Orders">
                <div className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 rounded-2xl p-6 shadow-sm">
                    <OrdersTable orders={data.recentOrders} />
                </div>
            </Section>
        </div>
    );
}
