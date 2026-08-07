"use client";

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
    CreditCard, ArrowDownLeft, AlertTriangle, TrendingUp,
    CheckCircle2, XCircle, Clock, RefreshCw, ExternalLink,
    Banknote, Shield, DollarSign, Zap, Loader2,
} from 'lucide-react';
import { StatCard } from '@/components/admin/StatCard';
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import { formatDate } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Payment {
    id: string; amount: number; currency: string; status: string;
    description: string | null; customer: string | null;
    created: number; metadata: Record<string, string>; refunded: boolean;
}
interface Refund  { id: string; amount: number; currency: string; status: string; reason: string | null; created: number; }
interface Dispute { id: string; amount: number; currency: string; status: string; reason: string;  created: number; }
interface Payout  { id: string; amount: number; currency: string; status: string; arrivalDate: number; created: number; }

interface StripeClientProps {
    data: {
        isLive: boolean;
        balance: {
            available: { amount: number; currency: string }[];
            pending:   { amount: number; currency: string }[];
        };
        stats: { totalPayments: number; succeeded: number; totalVolume: number; totalRefunded: number; openDisputes: number };
        payments:  Payment[];
        refunds:   Refund[];
        disputes:  Dispute[];
        payouts:   Payout[];
    };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (amount: number, currency: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);

const fmtDate = (ms: number) => formatDate(new Date(ms).toISOString());

function piStatusStyle(status: string) {
    if (status === 'succeeded')        return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    if (status === 'processing')       return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    if (status === 'requires_payment_method' || status === 'canceled') return 'bg-rose-500/10 text-rose-600 border-rose-500/20';
    return 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-white/5 dark:border-white/10';
}

function disputeStatusStyle(status: string) {
    if (status === 'won')              return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    if (status === 'lost')             return 'bg-rose-500/10 text-rose-600 border-rose-500/20';
    if (status === 'needs_response')   return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    return 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-white/5 dark:border-white/10';
}

const TABS = ['Payments', 'Refunds', 'Disputes', 'Payouts'] as const;
type Tab = typeof TABS[number];

const STRIPE_DASHBOARD = 'https://dashboard.stripe.com';

// ─── Component ───────────────────────────────────────────────────────────────

export function StripeClient({ data }: StripeClientProps) {
    const { isLive, balance, stats, payments, refunds, disputes, payouts } = data;
    const [tab, setTab] = useState<Tab>('Payments');
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const successRate = stats.totalPayments > 0
        ? ((stats.succeeded / stats.totalPayments) * 100).toFixed(1)
        : '0.0';

    // Primary balance currency (first available balance)
    const primaryAvailable = balance.available[0];
    const primaryPending   = balance.pending[0];

    return (
        <div className="space-y-10 pb-20">

            {/* Mode badge */}
            <div className="flex items-center gap-3">
                <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest border ${isLive ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 border-amber-500/20'}`}>
                    <Zap size={12} />
                    {isLive ? 'Live Mode' : 'Test Mode'}
                </span>
                <a href={STRIPE_DASHBOARD} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline">
                    Open Stripe Dashboard <ExternalLink size={12} />
                </a>
                <button
                    onClick={() => startTransition(() => router.refresh())}
                    disabled={isPending}
                    className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-600/10 border border-slate-200 dark:border-white/10 transition-all disabled:opacity-50"
                >
                    {isPending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    Refresh
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <StatCard title="Total Volume"   value={primaryAvailable ? fmt(stats.totalVolume, primaryAvailable.currency) : `$${stats.totalVolume.toFixed(2)}`} icon={TrendingUp}  variant="white" trend="Last 20 payments" />
                <StatCard title="Succeeded"       value={String(stats.succeeded)}   icon={CheckCircle2} variant="white" trend={`${successRate}% success rate`} />
                <StatCard title="Total Refunded"  value={primaryAvailable ? fmt(stats.totalRefunded, primaryAvailable.currency) : `$${stats.totalRefunded.toFixed(2)}`} icon={RefreshCw}   variant="white" trend="Returned to customers" />
                <StatCard title="Open Disputes"   value={String(stats.openDisputes)} icon={AlertTriangle} variant="white" trend={stats.openDisputes > 0 ? 'Action required' : 'All clear'} />
                <StatCard title="Payments Shown"  value={String(stats.totalPayments)} icon={CreditCard}  variant="white" trend="Most recent 20" />
            </div>

            {/* Balance panel */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/5 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                            <Banknote size={16} className="text-emerald-600" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-slate-900 dark:text-white">Available Balance</h3>
                            <p className="text-[11px] text-slate-400">Ready to pay out</p>
                        </div>
                    </div>
                    {balance.available.length === 0
                        ? <p className="text-sm text-slate-400 italic">No available balance</p>
                        : balance.available.map(b => (
                            <div key={b.currency} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-white/5">
                                <span className="text-xs font-black text-slate-500 uppercase tracking-wider">{b.currency}</span>
                                <span className="text-lg font-black text-emerald-600">{fmt(b.amount, b.currency)}</span>
                            </div>
                        ))
                    }
                </div>

                <div className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/5 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                            <Clock size={16} className="text-amber-600" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-slate-900 dark:text-white">Pending Balance</h3>
                            <p className="text-[11px] text-slate-400">Settling in 2–7 days</p>
                        </div>
                    </div>
                    {balance.pending.length === 0
                        ? <p className="text-sm text-slate-400 italic">No pending balance</p>
                        : balance.pending.map(b => (
                            <div key={b.currency} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-white/5">
                                <span className="text-xs font-black text-slate-500 uppercase tracking-wider">{b.currency}</span>
                                <span className="text-lg font-black text-amber-600">{fmt(b.amount, b.currency)}</span>
                            </div>
                        ))
                    }
                </div>
            </div>

            {/* Tabs */}
            <div className="space-y-4">
                <div className="flex items-center gap-1 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-1.5 w-fit">
                    {TABS.map(t => (
                        <button key={t} onClick={() => setTab(t)}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${tab === t ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-blue-600'}`}>
                            {t}
                            {t === 'Disputes' && stats.openDisputes > 0 && (
                                <span className="ml-1.5 bg-rose-500 text-white rounded-full text-[9px] font-black px-1.5 py-0.5">
                                    {stats.openDisputes}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Payments table */}
                {tab === 'Payments' && (
                    <div className="bg-white dark:bg-obsidian rounded-2xl overflow-hidden border border-slate-100 dark:border-white/5 shadow-sm">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent border-slate-100 dark:border-white/5">
                                        <TableHead className="pl-6">ID</TableHead>
                                        <TableHead>Customer</TableHead>
                                        <TableHead>Amount</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead className="pr-6 text-right">Date</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {payments.map(p => (
                                        <TableRow key={p.id} className="hover:bg-slate-50 dark:hover:bg-white/5 border-slate-100 dark:border-white/5">
                                            <TableCell className="pl-6">
                                                <a href={`${STRIPE_DASHBOARD}/payments/${p.id}`} target="_blank" rel="noopener noreferrer"
                                                    className="flex items-center gap-1 font-mono text-xs text-blue-600 hover:underline">
                                                    {p.id.slice(0, 18)}… <ExternalLink size={10} />
                                                </a>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-xs text-slate-600 dark:text-slate-300">
                                                    {p.customer ?? p.metadata?.passengerEmail ?? p.metadata?.userId?.slice(0, 8) ?? '—'}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <span className={`text-sm font-bold ${p.refunded ? 'line-through text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                                                    {fmt(p.amount, p.currency)}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={`font-bold text-xs border ${p.refunded ? 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800' : piStatusStyle(p.status)}`}>
                                                    {p.refunded ? 'refunded' : p.status.replace(/_/g, ' ')}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                    {p.metadata?.type ?? p.metadata?.provider ?? '—'}
                                                </span>
                                            </TableCell>
                                            <TableCell className="pr-6 text-right">
                                                <span className="text-xs text-slate-400">{fmtDate(p.created)}</span>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        {payments.length === 0 && (
                            <div className="py-16 text-center">
                                <CreditCard size={36} className="mx-auto text-slate-200 dark:text-white/10 mb-3" strokeWidth={1} />
                                <p className="text-sm font-black text-slate-900 dark:text-white">No payments yet</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Refunds table */}
                {tab === 'Refunds' && (
                    <div className="bg-white dark:bg-obsidian rounded-2xl overflow-hidden border border-slate-100 dark:border-white/5 shadow-sm">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent border-slate-100 dark:border-white/5">
                                        <TableHead className="pl-6">ID</TableHead>
                                        <TableHead>Amount</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Reason</TableHead>
                                        <TableHead className="pr-6 text-right">Date</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {refunds.map(r => (
                                        <TableRow key={r.id} className="hover:bg-slate-50 dark:hover:bg-white/5 border-slate-100 dark:border-white/5">
                                            <TableCell className="pl-6">
                                                <a href={`${STRIPE_DASHBOARD}/refunds/${r.id}`} target="_blank" rel="noopener noreferrer"
                                                    className="flex items-center gap-1 font-mono text-xs text-blue-600 hover:underline">
                                                    {r.id.slice(0, 18)}… <ExternalLink size={10} />
                                                </a>
                                            </TableCell>
                                            <TableCell><span className="text-sm font-bold text-rose-600">{fmt(r.amount, r.currency)}</span></TableCell>
                                            <TableCell>
                                                <Badge className={`font-bold text-xs border ${r.status === 'succeeded' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 border-amber-500/20'}`}>
                                                    {r.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell><span className="text-xs text-slate-500 capitalize">{r.reason?.replace(/_/g, ' ') ?? '—'}</span></TableCell>
                                            <TableCell className="pr-6 text-right"><span className="text-xs text-slate-400">{fmtDate(r.created)}</span></TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        {refunds.length === 0 && (
                            <div className="py-16 text-center">
                                <RefreshCw size={36} className="mx-auto text-slate-200 dark:text-white/10 mb-3" strokeWidth={1} />
                                <p className="text-sm font-black text-slate-900 dark:text-white">No refunds</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Disputes table */}
                {tab === 'Disputes' && (
                    <div className="bg-white dark:bg-obsidian rounded-2xl overflow-hidden border border-slate-100 dark:border-white/5 shadow-sm">
                        {stats.openDisputes > 0 && (
                            <div className="flex items-center gap-3 px-6 py-3 bg-rose-50 dark:bg-rose-500/10 border-b border-rose-200 dark:border-rose-500/20">
                                <AlertTriangle size={16} className="text-rose-500 shrink-0" />
                                <p className="text-xs font-bold text-rose-700 dark:text-rose-400">
                                    {stats.openDisputes} dispute{stats.openDisputes !== 1 ? 's' : ''} require{stats.openDisputes === 1 ? 's' : ''} your response in the Stripe Dashboard.
                                </p>
                                <a href={`${STRIPE_DASHBOARD}/disputes`} target="_blank" rel="noopener noreferrer"
                                    className="ml-auto text-xs font-bold text-rose-600 hover:underline flex items-center gap-1">
                                    Respond <ExternalLink size={11} />
                                </a>
                            </div>
                        )}
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent border-slate-100 dark:border-white/5">
                                        <TableHead className="pl-6">ID</TableHead>
                                        <TableHead>Amount</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Reason</TableHead>
                                        <TableHead className="pr-6 text-right">Date</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {disputes.map(d => (
                                        <TableRow key={d.id} className="hover:bg-slate-50 dark:hover:bg-white/5 border-slate-100 dark:border-white/5">
                                            <TableCell className="pl-6">
                                                <a href={`${STRIPE_DASHBOARD}/disputes/${d.id}`} target="_blank" rel="noopener noreferrer"
                                                    className="flex items-center gap-1 font-mono text-xs text-blue-600 hover:underline">
                                                    {d.id.slice(0, 18)}… <ExternalLink size={10} />
                                                </a>
                                            </TableCell>
                                            <TableCell><span className="text-sm font-bold text-rose-600">{fmt(d.amount, d.currency)}</span></TableCell>
                                            <TableCell>
                                                <Badge className={`font-bold text-xs border ${disputeStatusStyle(d.status)}`}>
                                                    {d.status.replace(/_/g, ' ')}
                                                </Badge>
                                            </TableCell>
                                            <TableCell><span className="text-xs text-slate-500 capitalize">{d.reason.replace(/_/g, ' ')}</span></TableCell>
                                            <TableCell className="pr-6 text-right"><span className="text-xs text-slate-400">{fmtDate(d.created)}</span></TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        {disputes.length === 0 && (
                            <div className="py-16 text-center">
                                <Shield size={36} className="mx-auto text-slate-200 dark:text-white/10 mb-3" strokeWidth={1} />
                                <p className="text-sm font-black text-slate-900 dark:text-white">No disputes</p>
                                <p className="text-slate-400 text-xs mt-1">All clear</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Payouts table */}
                {tab === 'Payouts' && (
                    <div className="bg-white dark:bg-obsidian rounded-2xl overflow-hidden border border-slate-100 dark:border-white/5 shadow-sm">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent border-slate-100 dark:border-white/5">
                                        <TableHead className="pl-6">ID</TableHead>
                                        <TableHead>Amount</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Arrival</TableHead>
                                        <TableHead className="pr-6 text-right">Created</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {payouts.map(p => (
                                        <TableRow key={p.id} className="hover:bg-slate-50 dark:hover:bg-white/5 border-slate-100 dark:border-white/5">
                                            <TableCell className="pl-6">
                                                <a href={`${STRIPE_DASHBOARD}/payouts/${p.id}`} target="_blank" rel="noopener noreferrer"
                                                    className="flex items-center gap-1 font-mono text-xs text-blue-600 hover:underline">
                                                    {p.id.slice(0, 18)}… <ExternalLink size={10} />
                                                </a>
                                            </TableCell>
                                            <TableCell><span className="text-sm font-bold text-slate-900 dark:text-white">{fmt(p.amount, p.currency)}</span></TableCell>
                                            <TableCell>
                                                <Badge className={`font-bold text-xs border ${p.status === 'paid' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : p.status === 'pending' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' : 'bg-rose-500/10 text-rose-600 border-rose-500/20'}`}>
                                                    {p.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell><span className="text-xs text-slate-500">{fmtDate(p.arrivalDate)}</span></TableCell>
                                            <TableCell className="pr-6 text-right"><span className="text-xs text-slate-400">{fmtDate(p.created)}</span></TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        {payouts.length === 0 && (
                            <div className="py-16 text-center">
                                <Banknote size={36} className="mx-auto text-slate-200 dark:text-white/10 mb-3" strokeWidth={1} />
                                <p className="text-sm font-black text-slate-900 dark:text-white">No payouts yet</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
