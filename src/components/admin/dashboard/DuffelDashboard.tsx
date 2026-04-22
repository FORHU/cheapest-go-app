"use client";

import React from 'react';
import { motion } from 'framer-motion';
import {
    Plane, TrendingUp, Users, MapPin, ExternalLink,
    CheckCircle2, Clock, XCircle, AlertTriangle, DollarSign,
    Hash, RefreshCw, PackageX,
} from 'lucide-react';
import type { DuffelProviderData, DuffelOrder } from '@/types/admin';

interface DuffelDashboardProps { data: DuffelProviderData; }

// ─── Helpers ───────────────────────────────────────────────

function fmtShort(n: number, currency: string) {
    return n.toLocaleString('en-US', { style: 'currency', currency, maximumFractionDigits: 0 });
}

// ─── Status badge ──────────────────────────────────────────

function DuffelStatusBadge({ status }: { status: DuffelProviderData['status'] }) {
    const cfg = {
        healthy:        { label: 'Connected',       cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-500 animate-pulse' },
        error:          { label: 'Error',           cls: 'bg-rose-500/10    text-rose-600    dark:text-rose-400    border-rose-500/20',    dot: 'bg-rose-500' },
        not_configured: { label: 'Not Configured',  cls: 'bg-slate-500/10   text-slate-500                         border-slate-500/20',   dot: 'bg-slate-400' },
    };
    const { label, cls, dot } = cfg[status];
    return (
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />{label}
        </div>
    );
}

// ─── Mini stat pill ────────────────────────────────────────

function MiniStat({ icon: Icon, label, value, iconCls }: {
    icon: React.ElementType; label: string; value: React.ReactNode; iconCls: string;
}) {
    return (
        <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconCls}`}>
                <Icon size={16} />
            </div>
            <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                <p className="text-sm font-black text-slate-900 dark:text-white truncate">{value ?? '—'}</p>
            </div>
        </div>
    );
}

// ─── Order status badge ────────────────────────────────────

function OrderStatusBadge({ status }: { status: DuffelOrder['status'] }) {
    const cfg = {
        confirmed:        { label: 'Confirmed',        cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', icon: CheckCircle2 },
        cancelled:        { label: 'Cancelled',        cls: 'bg-rose-500/10 text-rose-500',                             icon: XCircle },
        awaiting_payment: { label: 'Pending',          cls: 'bg-amber-500/10 text-amber-600',                           icon: Clock },
    } as const;
    const { label, cls, icon: Icon } = cfg[status] || cfg.confirmed;
    return (
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${cls}`}>
            <Icon size={9} />{label}
        </span>
    );
}

// ─── Top routes mini list ──────────────────────────────────

function MiniRoutes({ routes }: { routes: DuffelProviderData['topRoutesByVolume'] }) {
    if (!routes.length) return (
        <div className="flex flex-col items-center py-6 text-slate-400 opacity-40">
            <MapPin size={22} className="mb-1" />
            <p className="text-[10px] font-bold uppercase tracking-widest">No routes yet</p>
        </div>
    );
    const max = Math.max(...routes.map(r => r.count), 1);
    return (
        <div className="space-y-2.5">
            {routes.map((r, i) => (
                <motion.div key={r.route} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.06 }} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                        <span className="font-black text-slate-800 dark:text-white">{r.origin} → {r.destination}</span>
                        <span className="font-bold text-slate-400">{r.count}</span>
                    </div>
                </motion.div>
            ))}
        </div>
    );
}

// ─── Recent orders mini table ──────────────────────────────

function MiniOrders({ orders }: { orders: DuffelOrder[] }) {
    if (!orders.length) return (
        <div className="flex flex-col items-center py-8 text-slate-400 opacity-40">
            <Plane size={30} className="mb-2" />
            <p className="text-[10px] font-bold uppercase tracking-widest">No recent orders</p>
        </div>
    );
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-slate-100 dark:border-white/5">
                        {['Ref', 'Passenger', 'Route', 'Amount', 'Status'].map(h => (
                            <th key={h} className="text-left text-[9px] font-black uppercase tracking-widest text-slate-400 pb-2 pr-3 last:pr-0">{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                    {orders.slice(0, 8).map((o, i) => {
                        const amt = parseFloat(o.totalAmount).toLocaleString('en-US', { style: 'currency', currency: o.currency, maximumFractionDigits: 0 });
                        return (
                            <motion.tr key={o.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                transition={{ delay: i * 0.04 }}
                                className="hover:bg-slate-50 dark:hover:bg-white/3 transition-colors">
                                <td className="py-2.5 pr-3">
                                    <span className="font-mono text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/5 px-1.5 py-0.5 rounded">{o.bookingReference}</span>
                                </td>
                                <td className="py-2.5 pr-3"><span className="font-bold text-slate-800 dark:text-slate-100 text-[11px] whitespace-nowrap">{o.passengerName}</span></td>
                                <td className="py-2.5 pr-3"><span className="text-[11px] font-black text-slate-700 dark:text-slate-200 whitespace-nowrap">{o.origin} → {o.destination}</span></td>
                                <td className="py-2.5 pr-3"><span className="font-black text-[11px] text-slate-900 dark:text-white whitespace-nowrap">{amt}</span></td>
                                <td className="py-2.5"><OrderStatusBadge status={o.status} /></td>
                            </motion.tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

// ─── Not configured / error states ────────────────────────

function DuffelNotConfigured() {
    return (
        <div className="flex flex-col items-center py-10 text-slate-400">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-3">
                <Plane size={22} className="text-slate-400" />
            </div>
            <p className="text-sm font-black text-slate-700 dark:text-slate-300 mb-1">Duffel Not Configured</p>
            <p className="text-[11px] text-slate-400 text-center max-w-xs font-medium">
                Add <code className="bg-slate-100 dark:bg-white/10 px-1 rounded">DUFFEL_ACCESS_TOKEN</code> to enable live data.
            </p>
        </div>
    );
}

function DuffelErrorState({ message }: { message?: string }) {
    return (
        <div className="flex flex-col items-center py-10">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center mb-3">
                <AlertTriangle size={22} className="text-rose-500" />
            </div>
            <p className="text-sm font-black text-slate-700 dark:text-slate-300 mb-1">Failed to load Duffel data</p>
            {message && <p className="text-[11px] text-slate-400 font-medium text-center max-w-sm">{message}</p>}
        </div>
    );
}

// ─── Main widget ───────────────────────────────────────────

export function DuffelDashboard({ data }: DuffelDashboardProps) {
    const cur = data.orderCurrency || 'USD';

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                        <Plane size={20} />
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-slate-900 dark:text-white">Duffel</h3>
                        <div className="mt-0.5"><DuffelStatusBadge status={data.status} /></div>
                    </div>
                </div>
                <a href="https://app.duffel.com" target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-blue-600 hover:text-blue-500 transition-colors">
                    Open Dashboard <ExternalLink size={12} />
                </a>
            </div>

            {data.status === 'not_configured' ? <DuffelNotConfigured /> :
             data.status === 'error'          ? <DuffelErrorState message={data.errorMessage} /> : (
                <>
                    {/* Insight stats — 3×2 grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                        <MiniStat icon={Hash}       label="Orders (30d)"   value={data.ordersCreated}                                                         iconCls="bg-blue-500/10 text-blue-500" />
                        <MiniStat icon={DollarSign} label="Gross Value"    value={data.grossOrderValue !== null ? fmtShort(data.grossOrderValue, cur) : null}  iconCls="bg-emerald-500/10 text-emerald-500" />
                        <MiniStat icon={XCircle}    label="Cancelled"      value={data.ordersCancelled}                                                        iconCls="bg-rose-500/10 text-rose-500" />
                        <MiniStat icon={RefreshCw}  label="Changed"        value={data.ordersChanged}                                                          iconCls="bg-amber-500/10 text-amber-500" />
                        <MiniStat icon={PackageX}   label="Ancillaries"    value={data.ancillariesSold}                                                        iconCls="bg-violet-500/10 text-violet-500" />
                        <MiniStat icon={TrendingUp} label="Attach Rate"    value={data.ancillaryAttachmentRate !== null ? `${data.ancillaryAttachmentRate}%` : null} iconCls="bg-cyan-500/10 text-cyan-500" />
                    </div>

                    {/* Two-column: top routes + recent orders */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                            className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 rounded-xl p-5 shadow-sm">
                            <div className="flex items-center gap-2 mb-4">
                                <MapPin size={13} className="text-blue-500" />
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Top Routes</h4>
                            </div>
                            <MiniRoutes routes={data.topRoutesByVolume} />
                        </motion.div>

                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
                            className="lg:col-span-2 bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 rounded-xl p-5 shadow-sm">
                            <div className="flex items-center gap-2 mb-4">
                                <Plane size={13} className="text-blue-500" />
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Recent Orders</h4>
                            </div>
                            <MiniOrders orders={data.recentOrders} />
                        </motion.div>
                    </div>
                </>
            )}
        </div>
    );
}
