"use client";

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
    Hotel, Globe, CheckCircle2, XCircle, Clock, RefreshCw,
    AlertTriangle, ExternalLink, Key, Server, Loader2,
    Building2, Calendar, DollarSign, TrendingUp, Activity,
    Wifi, WifiOff, Shield, ChevronRight, Info,
} from 'lucide-react';
import { StatCard } from '@/components/admin/StatCard';
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import type { TravelgateXProviderData } from '@/types/admin';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (amount: number, currency: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);

const fmtDate = (iso: string) => {
    try { return formatDate(new Date(iso).toISOString()); } catch { return iso; }
};

function bookingStatusStyle(status: string) {
    if (status === 'confirmed') return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    if (status === 'cancelled') return 'bg-rose-500/10 text-rose-600 border-rose-500/20';
    return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
}

function httpStatusStyle(code: number | null) {
    if (!code) return 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-white/5 dark:border-white/10';
    if (code < 300) return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    if (code < 500) return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    return 'bg-rose-500/10 text-rose-600 border-rose-500/20';
}

// ─── OTV Status chip ─────────────────────────────────────────────────────────

function OTVStatusChip({ status, checking }: { status: TravelgateXProviderData['otvStatus']; checking?: boolean }) {
    if (checking) {
        return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black uppercase tracking-widest border bg-slate-100 text-slate-400 border-slate-200 dark:bg-white/5 dark:border-white/10 animate-pulse">
                <Activity size={11} /> Checking…
            </span>
        );
    }
    if (status === 'active') {
        return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black uppercase tracking-widest border bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                <Wifi size={11} /> OTV Live
            </span>
        );
    }
    if (status === 'no_rates') {
        return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black uppercase tracking-widest border bg-amber-500/10 text-amber-600 border-amber-500/20">
                <WifiOff size={11} /> No Rates
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black uppercase tracking-widest border bg-slate-100 text-slate-500 border-slate-200 dark:bg-white/5 dark:border-white/10">
            <Activity size={11} /> Unknown
        </span>
    );
}

// ─── Config Row ───────────────────────────────────────────────────────────────

function ConfigRow({ label, value, mono = false }: { label: string; value: string | null; mono?: boolean }) {
    return (
        <div className="flex items-center justify-between py-2.5 border-b border-slate-50 dark:border-white/5 last:border-0">
            <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">{label}</span>
            <span className={`text-sm font-bold text-slate-900 dark:text-white ${mono ? 'font-mono text-xs' : ''}`}>
                {value ?? <span className="text-slate-300 dark:text-white/20 italic text-xs">not set</span>}
            </span>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props { data: TravelgateXProviderData }

export function TravelgateXAdminClient({ data }: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [activeTab, setActiveTab] = useState<'bookings' | 'logs'>('bookings');
    const [otvStatusLive, setOtvStatusLive] = useState<TravelgateXProviderData['otvStatus']>('unknown');
    const [healthChecked, setHealthChecked] = useState(false);

    React.useEffect(() => {
        if (!data.apiKeyConfigured) { setHealthChecked(true); return; }
        fetch('/api/admin/tgx-health')
            .then(r => r.json())
            .then(d => { setOtvStatusLive(d.otvStatus ?? 'unknown'); setHealthChecked(true); })
            .catch(() => { setOtvStatusLive('unknown'); setHealthChecked(true); });
    }, [data.apiKeyConfigured]);

    const otvStatus = healthChecked ? otvStatusLive : 'unknown';

    const {
        apiKeyConfigured, accessCode, clientName, contextCode, supplierCode,
        totalBookings, confirmedBookings, cancelledBookings, totalRevenue, revenueCurrency,
        recentBookings, recentApiLogs, status, errorMessage,
    } = data;

    const currency = revenueCurrency || 'USD';

    return (
        <div className="space-y-10 pb-20">

            {/* ── Header bar ────────────────────────────────── */}
            <div className="flex items-center gap-3 flex-wrap">
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest border bg-blue-500/10 text-blue-600 border-blue-500/20">
                    <Hotel size={12} /> TravelgateX · OTV
                </span>

                <OTVStatusChip status={otvStatus} checking={!healthChecked} />

                {status === 'not_configured' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest border bg-rose-500/10 text-rose-600 border-rose-500/20">
                        <Key size={11} /> API Key Missing
                    </span>
                )}

                <a
                    href="https://app.travelgate.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline"
                >
                    TravelgateX Portal <ExternalLink size={11} />
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

            {/* ── OTV no-rates warning ──────────────────────── */}
            {otvStatus === 'no_rates' && (
                <div className="flex items-start gap-4 px-5 py-4 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
                    <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                    <div className="space-y-1 flex-1 min-w-0">
                        <p className="text-sm font-black text-amber-800 dark:text-amber-300">
                            OTV returning no rates — rate plan action required
                        </p>
                        <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                            The TravelgateX API is reachable and the destination catalog loads correctly (access <code className="font-mono bg-amber-100 dark:bg-amber-500/20 px-1 rounded">{accessCode}</code>), but hotel searches return 0 options. This typically means FORHU INC's WorldOTA/RateHawk B2B account does not yet have active rate agreements for the queried markets. Contact TravelgateX support or WorldOTA/RateHawk directly to confirm which destinations and markets are enabled under access {accessCode}.
                        </p>
                    </div>
                    <a
                        href="https://docs.travelgate.com/kb/connectivity-faq"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-xs font-bold text-amber-700 dark:text-amber-300 hover:underline flex items-center gap-1"
                    >
                        Docs <ExternalLink size={10} />
                    </a>
                </div>
            )}

            {/* ── Error banner ──────────────────────────────── */}
            {status === 'error' && errorMessage && (
                <div className="flex items-start gap-3 px-5 py-4 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20">
                    <XCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />
                    <p className="text-xs font-bold text-rose-700 dark:text-rose-400">{errorMessage}</p>
                </div>
            )}

            {/* ── Stats grid ────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    title="Hotel Bookings"
                    value={totalBookings != null ? String(totalBookings) : '—'}
                    icon={Building2}
                    variant="white"
                    trend="All time via OTV"
                />
                <StatCard
                    title="Confirmed"
                    value={confirmedBookings != null ? String(confirmedBookings) : '—'}
                    icon={CheckCircle2}
                    variant="white"
                    trend="Active reservations"
                />
                <StatCard
                    title="Cancelled"
                    value={cancelledBookings != null ? String(cancelledBookings) : '—'}
                    icon={XCircle}
                    variant="white"
                    trend="Cancelled reservations"
                />
                <StatCard
                    title="Revenue"
                    value={totalRevenue != null ? fmt(totalRevenue, currency) : '—'}
                    icon={TrendingUp}
                    variant="white"
                    trend="Confirmed bookings only"
                />
            </div>

            {/* ── Config + OTV connection ───────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Credentials */}
                <div className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/5 rounded-2xl p-6 space-y-1">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                            <Key size={16} className="text-blue-600" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-slate-900 dark:text-white">API Configuration</h3>
                            <p className="text-[11px] text-slate-400">Hotel-X GraphQL endpoint</p>
                        </div>
                    </div>
                    <ConfigRow label="API Key" value={apiKeyConfigured ? '••••••••  (configured)' : null} mono />
                    <ConfigRow label="Client" value={clientName} mono />
                    <ConfigRow label="Access Code" value={accessCode} mono />
                    <ConfigRow label="Supplier" value={supplierCode} mono />
                    <ConfigRow label="Context" value={contextCode} mono />
                    <ConfigRow label="Endpoint" value="api.travelgate.com" mono />
                </div>

                {/* OTV / WorldOTA status */}
                <div className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/5 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0">
                            <Globe size={16} className="text-purple-600" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-slate-900 dark:text-white">OTV / WorldOTA (RateHawk)</h3>
                            <p className="text-[11px] text-slate-400">Emerging Travel Group · B2B hotel rates</p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <StatusRow
                            label="API Connectivity"
                            ok={otvStatus !== 'unknown'}
                            text={!healthChecked ? 'Checking…' : otvStatus !== 'unknown' ? 'Reachable' : 'Health check timed out'}
                        />
                        <StatusRow
                            label="Destination Catalog"
                            ok={otvStatus === 'active' || otvStatus === 'no_rates'}
                            text={!healthChecked ? 'Checking…' : otvStatus === 'active' || otvStatus === 'no_rates' ? 'Loaded (worldwide)' : 'Unknown'}
                        />
                        <StatusRow
                            label="Rate Plans (Hotel-X)"
                            ok={otvStatus === 'active'}
                            text={
                                otvStatus === 'active' ? 'Active' :
                                otvStatus === 'no_rates' ? 'No rates — contact OTV/RateHawk' :
                                'Unknown'
                            }
                            warn={otvStatus === 'no_rates'}
                        />
                        <StatusRow
                            label="API Key"
                            ok={apiKeyConfigured}
                            text={apiKeyConfigured ? 'Configured' : 'Missing — set TRAVELGATE_API_KEY'}
                        />
                    </div>

                    <div className="pt-2 border-t border-slate-50 dark:border-white/5">
                        <p className="text-[10px] text-slate-400 leading-relaxed">
                            <Info size={10} className="inline mr-1" />
                            Plugin <code className="font-mono">search_by_destination</code> is required and active on access {accessCode}. If rates are still missing, escalate to WorldOTA B2B support.
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Tabs ─────────────────────────────────────────── */}
            <div className="space-y-4">
                <div className="flex items-center gap-1 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-1.5 w-fit">
                    {(['bookings', 'logs'] as const).map(t => (
                        <button
                            key={t}
                            onClick={() => setActiveTab(t)}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all capitalize ${activeTab === t ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-blue-600'}`}
                        >
                            {t === 'bookings' ? 'Hotel Bookings' : 'API Logs'}
                        </button>
                    ))}
                </div>

                {/* Hotel bookings table */}
                {activeTab === 'bookings' && (
                    <div className="bg-white dark:bg-obsidian rounded-2xl overflow-hidden border border-slate-100 dark:border-white/5 shadow-sm">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent border-slate-100 dark:border-white/5">
                                        <TableHead className="pl-6">Reference</TableHead>
                                        <TableHead>Guest</TableHead>
                                        <TableHead>Hotel</TableHead>
                                        <TableHead>Check-in</TableHead>
                                        <TableHead>Check-out</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="pr-6 text-right">Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {recentBookings.map(b => (
                                        <TableRow key={b.id} className="hover:bg-slate-50 dark:hover:bg-white/5 border-slate-100 dark:border-white/5">
                                            <TableCell className="pl-6">
                                                <span className="font-mono text-xs text-blue-600 font-bold">{b.reference}</span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-sm font-bold text-slate-900 dark:text-white">{b.guestName}</span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-xs text-slate-600 dark:text-slate-300">{b.hotelName || b.destination || '—'}</span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-xs text-slate-500">{b.checkIn ? fmtDate(b.checkIn) : '—'}</span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-xs text-slate-500">{b.checkOut ? fmtDate(b.checkOut) : '—'}</span>
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={`font-bold text-xs border ${bookingStatusStyle(b.status)}`}>
                                                    {b.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="pr-6 text-right">
                                                <span className="text-sm font-black text-slate-900 dark:text-white">
                                                    {b.amount ? fmt(b.amount, b.currency) : '—'}
                                                </span>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        {recentBookings.length === 0 && (
                            <div className="py-16 text-center">
                                <Hotel size={36} className="mx-auto text-slate-200 dark:text-white/10 mb-3" strokeWidth={1} />
                                <p className="text-sm font-black text-slate-900 dark:text-white">No hotel bookings yet</p>
                                <p className="text-xs text-slate-400 mt-1">Bookings placed via OTV will appear here</p>
                            </div>
                        )}
                    </div>
                )}

                {/* API logs table */}
                {activeTab === 'logs' && (
                    <div className="bg-white dark:bg-obsidian rounded-2xl overflow-hidden border border-slate-100 dark:border-white/5 shadow-sm">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent border-slate-100 dark:border-white/5">
                                        <TableHead className="pl-6">Endpoint</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Duration</TableHead>
                                        <TableHead>Error</TableHead>
                                        <TableHead className="pr-6 text-right">Date</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {recentApiLogs.map(log => (
                                        <TableRow key={log.id} className="hover:bg-slate-50 dark:hover:bg-white/5 border-slate-100 dark:border-white/5">
                                            <TableCell className="pl-6">
                                                <span className="font-mono text-xs text-slate-600 dark:text-slate-300 truncate max-w-[200px] block">
                                                    {log.endpoint.replace('https://', '').replace('http://', '') || '—'}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={`font-bold text-xs border ${httpStatusStyle(log.responseStatus)}`}>
                                                    {log.responseStatus ?? '—'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <span className={`text-xs font-bold ${log.durationMs > 5000 ? 'text-rose-500' : log.durationMs > 2000 ? 'text-amber-500' : 'text-emerald-600'}`}>
                                                    {log.durationMs ? `${log.durationMs.toLocaleString()}ms` : '—'}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-xs text-rose-500 truncate max-w-[180px] block">
                                                    {log.errorMessage || <span className="text-slate-300 dark:text-white/20">—</span>}
                                                </span>
                                            </TableCell>
                                            <TableCell className="pr-6 text-right">
                                                <span className="text-xs text-slate-400">{fmtDate(log.createdAt)}</span>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        {recentApiLogs.length === 0 && (
                            <div className="py-16 text-center">
                                <Activity size={36} className="mx-auto text-slate-200 dark:text-white/10 mb-3" strokeWidth={1} />
                                <p className="text-sm font-black text-slate-900 dark:text-white">No API logs</p>
                                <p className="text-xs text-slate-400 mt-1">TravelgateX calls will be logged here</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Status row helper ────────────────────────────────────────────────────────

function StatusRow({ label, ok, text, warn = false }: { label: string; ok: boolean; text: string; warn?: boolean }) {
    const Icon = warn ? AlertTriangle : ok ? CheckCircle2 : XCircle;
    const iconCls = warn ? 'text-amber-500' : ok ? 'text-emerald-500' : 'text-rose-400';
    const textCls = warn ? 'text-amber-700 dark:text-amber-300' : ok ? 'text-slate-700 dark:text-slate-200' : 'text-rose-600 dark:text-rose-400';

    return (
        <div className="flex items-center gap-3">
            <Icon size={14} className={`${iconCls} shrink-0`} />
            <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 w-36 shrink-0">{label}</span>
            <span className={`text-xs font-bold ${textCls}`}>{text}</span>
        </div>
    );
}
