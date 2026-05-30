"use client";

import React, { useState, useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
    Smartphone, Key, CheckCircle2, XCircle, AlertTriangle,
    Plane, RefreshCw, ShieldCheck, User, ExternalLink,
    TrendingUp, Clock, Bell, Send, Tag, Copy, Eye, EyeOff,
    Layers, GitCommit, AlertCircle, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { StatCard } from '@/components/admin/StatCard';
import { Button, Badge, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import { formatDate } from '@/lib/utils';

interface MobileClientProps {
    data: {
        config: {
            apiKeySource: 'database' | 'env' | 'none';
            apiKeyPreview: string | null;
            apiKeyConfigured: boolean;
            guestUserConfigured: boolean;
            guestUserId: string | null;
        };
        versionConfig: {
            minVersion: string;
            latestVersion: string;
            forceUpdate: boolean;
            updateMessage: string;
        };
        stats: {
            total: number;
            confirmed: number;
            pending: number;
            failed: number;
            devices: number;
        };
        bookings: {
            id: string;
            pnr: string | null;
            status: string;
            payment_intent_id: string | null;
            created_at: string;
            session_id: string | null;
        }[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    };
}

const STATUS_STYLES: Record<string, string> = {
    confirmed:       'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    ticketed:        'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    booked:          'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    awaiting_ticket: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    pending:         'bg-amber-500/10 text-amber-600 border-amber-500/20',
    failed:          'bg-rose-500/10 text-rose-600 border-rose-500/20',
    cancelled:       'bg-slate-100 text-slate-500 border-slate-200 dark:bg-white/5 dark:border-white/10',
    refunded:        'bg-purple-500/10 text-purple-600 border-purple-500/20',
};

export function MobileClient({ data }: MobileClientProps) {
    const router = useRouter();
    const pathname = usePathname();
    const currentParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    // Key rotation
    const [rotating, setRotating] = useState(false);
    const [newKey, setNewKey] = useState<string | null>(null);
    const [keyVisible, setKeyVisible] = useState(false);

    // Push notification
    const [pushTitle, setPushTitle] = useState('');
    const [pushBody, setPushBody] = useState('');
    const [pushTarget, setPushTarget] = useState<'all' | 'user'>('all');
    const [pushUserId, setPushUserId] = useState('');
    const [sending, setSending] = useState(false);

    // Version config
    const [ver, setVer] = useState({
        minVersion:    data.versionConfig.minVersion,
        latestVersion: data.versionConfig.latestVersion,
        forceUpdate:   data.versionConfig.forceUpdate,
        updateMessage: data.versionConfig.updateMessage,
    });
    const [savingVer, setSavingVer] = useState(false);

    const updateParam = (params: Record<string, string | number>) => {
        const next = new URLSearchParams(currentParams.toString());
        Object.entries(params).forEach(([k, v]) => next.set(k, String(v)));
        startTransition(() => router.push(`${pathname}?${next.toString()}`));
    };

    const post = async (body: object) =>
        fetch('/api/admin/mobile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
            body: JSON.stringify(body),
        }).then(r => r.json());

    // ── Rotate API key ──────────────────────────────────────────────────
    const handleRotate = async () => {
        if (!confirm('Rotate the mobile API key? The old key stops working immediately. You must update the mobile app config before publishing a new build.')) return;
        setRotating(true);
        try {
            const json = await post({ action: 'rotate_api_key' });
            if (!json.success) throw new Error(json.error);
            setNewKey(json.newKey);
            setKeyVisible(true);
            toast.success('API key rotated. Copy the new key now — it won\'t be shown again.');
            startTransition(() => router.refresh());
        } catch (e: any) {
            toast.error(e.message ?? 'Rotation failed');
        } finally {
            setRotating(false);
        }
    };

    const copyKey = () => {
        if (!newKey) return;
        navigator.clipboard.writeText(newKey);
        toast.success('Key copied to clipboard');
    };

    // ── Send push notification ──────────────────────────────────────────
    const handleSendPush = async () => {
        if (!pushTitle.trim() || !pushBody.trim()) { toast.error('Title and body are required'); return; }
        if (pushTarget === 'user' && !pushUserId.trim()) { toast.error('User ID is required'); return; }
        setSending(true);
        try {
            const json = await post({
                action: 'send_push',
                title: pushTitle.trim(),
                body: pushBody.trim(),
                target: pushTarget,
                userId: pushTarget === 'user' ? pushUserId.trim() : undefined,
            });
            if (!json.success) throw new Error(json.error);
            toast.success(`Notification sent to ${json.sent} device${json.sent !== 1 ? 's' : ''}${json.errors ? ` (${json.errors} failed)` : ''}`);
            setPushTitle('');
            setPushBody('');
            setPushUserId('');
        } catch (e: any) {
            toast.error(e.message ?? 'Send failed');
        } finally {
            setSending(false);
        }
    };

    // ── Save version config ─────────────────────────────────────────────
    const handleSaveVersion = async () => {
        setSavingVer(true);
        try {
            const json = await post({ action: 'update_version', ...ver });
            if (!json.success) throw new Error(json.error);
            toast.success('Version config saved');
            startTransition(() => router.refresh());
        } catch (e: any) {
            toast.error(e.message ?? 'Save failed');
        } finally {
            setSavingVer(false);
        }
    };

    const { config, stats } = data;
    const successRate = stats.total > 0 ? ((stats.confirmed / stats.total) * 100).toFixed(1) : '0.0';

    return (
        <div className="space-y-10 pb-20">

            {/* Stats row */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <StatCard title="Total Bookings"  value={String(stats.total)}     icon={Smartphone}   variant="white" trend="Via Duffel (mobile)" />
                <StatCard title="Confirmed"        value={String(stats.confirmed)} icon={TrendingUp}   variant="white" trend="Ticketed or booked" />
                <StatCard title="Pending"          value={String(stats.pending)}   icon={Clock}        variant="white" trend="Awaiting ticket" />
                <StatCard title="Success Rate"     value={`${successRate}%`}       icon={ShieldCheck}  variant="white" trend="Confirmed ÷ total" />
                <StatCard title="Registered Devices" value={String(stats.devices)} icon={Bell}         variant="white" trend="Push-enabled" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* ── Panel 1: API Key ───────────────────────────────────── */}
                <div className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/5 rounded-2xl p-6 space-y-5">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0"><Key size={16} className="text-blue-600" /></div>
                        <div><h3 className="text-sm font-black text-slate-900 dark:text-white">API Key</h3>
                            <p className="text-[11px] text-slate-400">Live rotation — no redeploy needed</p></div>
                    </div>

                    {/* Current key status */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-white/5">
                            <div className="flex items-center gap-2">
                                {config.apiKeyConfigured
                                    ? <CheckCircle2 size={14} className="text-emerald-500" />
                                    : <XCircle size={14} className="text-rose-500" />}
                                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                                    {config.apiKeyConfigured ? 'Configured' : 'Not configured'}
                                </span>
                                {config.apiKeySource === 'database' && (
                                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-600">DB</span>
                                )}
                                {config.apiKeySource === 'env' && (
                                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-slate-200 dark:bg-white/10 text-slate-500">ENV</span>
                                )}
                            </div>
                            {config.apiKeyPreview && (
                                <code className="text-[11px] font-mono text-slate-400">{config.apiKeyPreview}</code>
                            )}
                        </div>

                        {!config.apiKeyConfigured && (
                            <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20">
                                <AlertTriangle size={13} className="text-rose-500 shrink-0 mt-0.5" />
                                <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                                    MOBILE_API_KEY missing. All mobile requests are rejected.
                                </p>
                            </div>
                        )}

                        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-white/5">
                            <div className="flex items-center gap-2"><User size={13} className="text-slate-400" /><span className="text-xs font-bold text-slate-500">Guest User</span></div>
                            <code className="text-[11px] font-mono text-slate-400">
                                {config.guestUserId ? `${config.guestUserId.slice(0, 8)}…` : 'default UUID'}
                            </code>
                        </div>
                    </div>

                    {/* New key reveal */}
                    {newKey && (
                        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 space-y-2">
                            <p className="text-[11px] font-black text-amber-700 dark:text-amber-400 uppercase tracking-wider">New key — copy now</p>
                            <div className="flex items-center gap-2">
                                <code className="text-xs font-mono text-amber-800 dark:text-amber-300 flex-1 break-all">
                                    {keyVisible ? newKey : `${newKey.slice(0, 8)}${'•'.repeat(24)}`}
                                </code>
                                <button onClick={() => setKeyVisible(v => !v)} className="text-amber-500 hover:text-amber-700">
                                    {keyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                                <button onClick={copyKey} className="text-amber-500 hover:text-amber-700"><Copy size={14} /></button>
                            </div>
                        </div>
                    )}

                    <Button
                        onClick={handleRotate}
                        disabled={rotating}
                        className="w-full rounded-xl h-10 font-bold text-xs gap-2 bg-blue-600 hover:bg-blue-500 text-white border-0"
                    >
                        <RefreshCw size={13} className={rotating ? 'animate-spin' : ''} />
                        {rotating ? 'Rotating…' : 'Rotate API Key'}
                    </Button>

                    <p className="text-[11px] text-slate-400 text-center">
                        After rotating, update <code className="font-mono bg-slate-100 dark:bg-white/10 px-1 rounded">MOBILE_API_KEY</code> in the mobile app and publish a new build.
                    </p>
                </div>

                {/* ── Panel 2: Push Notifications ───────────────────────── */}
                <div className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/5 rounded-2xl p-6 space-y-5">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0"><Bell size={16} className="text-violet-600" /></div>
                        <div><h3 className="text-sm font-black text-slate-900 dark:text-white">Push Notifications</h3>
                            <p className="text-[11px] text-slate-400">{stats.devices} registered device{stats.devices !== 1 ? 's' : ''} · Expo API</p></div>
                    </div>

                    <div className="space-y-3">
                        {/* Target selector */}
                        <div className="flex items-center gap-1 bg-slate-50 dark:bg-white/5 rounded-xl p-1">
                            {(['all', 'user'] as const).map(t => (
                                <button key={t} onClick={() => setPushTarget(t)}
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${pushTarget === t ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-blue-600'}`}>
                                    {t === 'all' ? 'All Devices' : 'Specific User'}
                                </button>
                            ))}
                        </div>

                        {pushTarget === 'user' && (
                            <Input
                                placeholder="User UUID"
                                value={pushUserId}
                                onChange={e => setPushUserId(e.target.value)}
                                className="rounded-xl h-9 text-sm font-mono"
                            />
                        )}

                        <Input
                            placeholder="Notification title"
                            value={pushTitle}
                            onChange={e => setPushTitle(e.target.value)}
                            className="rounded-xl h-9 text-sm"
                        />
                        <textarea
                            placeholder="Notification body"
                            value={pushBody}
                            onChange={e => setPushBody(e.target.value)}
                            rows={3}
                            className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm px-3 py-2 text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                        />

                        <Button
                            onClick={handleSendPush}
                            disabled={sending || stats.devices === 0}
                            className="w-full rounded-xl h-10 font-bold text-xs gap-2 bg-violet-600 hover:bg-violet-500 text-white border-0"
                        >
                            <Send size={13} className={sending ? 'animate-pulse' : ''} />
                            {sending ? 'Sending…' : `Send to ${pushTarget === 'all' ? `all ${stats.devices} devices` : 'user'}`}
                        </Button>

                        {stats.devices === 0 && (
                            <p className="text-[11px] text-slate-400 text-center">
                                No devices registered yet. The mobile app must call <code className="font-mono bg-slate-100 dark:bg-white/10 px-1 rounded">/api/mobile/register-device</code> on startup.
                            </p>
                        )}
                    </div>
                </div>

                {/* ── Panel 3: Version Control ───────────────────────────── */}
                <div className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/5 rounded-2xl p-6 space-y-5">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0"><GitCommit size={16} className="text-emerald-600" /></div>
                        <div><h3 className="text-sm font-black text-slate-900 dark:text-white">Version Control</h3>
                            <p className="text-[11px] text-slate-400">Force-update gate · checked on app launch</p></div>
                    </div>

                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[11px] font-bold text-slate-500 mb-1 block">Min Version</label>
                                <Input value={ver.minVersion} onChange={e => setVer(v => ({ ...v, minVersion: e.target.value }))} placeholder="1.0.0" className="rounded-xl h-9 text-sm font-mono" />
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-slate-500 mb-1 block">Latest Version</label>
                                <Input value={ver.latestVersion} onChange={e => setVer(v => ({ ...v, latestVersion: e.target.value }))} placeholder="1.2.0" className="rounded-xl h-9 text-sm font-mono" />
                            </div>
                        </div>

                        <div>
                            <label className="text-[11px] font-bold text-slate-500 mb-1 block">Update Message</label>
                            <textarea
                                value={ver.updateMessage}
                                onChange={e => setVer(v => ({ ...v, updateMessage: e.target.value }))}
                                rows={2}
                                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm px-3 py-2 text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                                placeholder="Please update to continue using CheapestGo."
                            />
                        </div>

                        <button
                            onClick={() => setVer(v => ({ ...v, forceUpdate: !v.forceUpdate }))}
                            className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${ver.forceUpdate ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20' : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10'}`}
                        >
                            <div className="flex items-center gap-2">
                                <AlertCircle size={14} className={ver.forceUpdate ? 'text-rose-500' : 'text-slate-400'} />
                                <span className={`text-xs font-bold ${ver.forceUpdate ? 'text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-300'}`}>
                                    Force Update {ver.forceUpdate ? 'ON' : 'OFF'}
                                </span>
                            </div>
                            {ver.forceUpdate
                                ? <ToggleRight size={20} className="text-rose-500" />
                                : <ToggleLeft size={20} className="text-slate-400" />}
                        </button>

                        {ver.forceUpdate && (
                            <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20">
                                <AlertTriangle size={13} className="text-rose-500 shrink-0 mt-0.5" />
                                <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                                    Users on versions below <strong>{ver.minVersion}</strong> will be blocked from using the app until they update.
                                </p>
                            </div>
                        )}

                        <Button
                            onClick={handleSaveVersion}
                            disabled={savingVer}
                            className="w-full rounded-xl h-10 font-bold text-xs gap-2 bg-emerald-600 hover:bg-emerald-500 text-white border-0"
                        >
                            <Layers size={13} />
                            {savingVer ? 'Saving…' : 'Save Version Config'}
                        </Button>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/5 space-y-1">
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Mobile app endpoint</p>
                        <code className="text-xs font-mono text-blue-600 dark:text-blue-400">GET /api/mobile/version-check</code>
                        <p className="text-[11px] text-slate-400">Public · call on app startup · no auth needed</p>
                    </div>
                </div>
            </div>

            {/* ── Duffel flight bookings table ──────────────────────────── */}
            <div className="space-y-4">
                <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
                    Duffel Flight Bookings
                </h2>
                <div className="bg-white dark:bg-obsidian rounded-2xl overflow-hidden border border-slate-100 dark:border-white/5 shadow-sm">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent border-slate-100 dark:border-white/5">
                                    <TableHead className="pl-6">PNR</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Session</TableHead>
                                    <TableHead>Stripe PI</TableHead>
                                    <TableHead className="pr-6 text-right">Created</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.bookings.map((b) => (
                                    <TableRow key={b.id} className="hover:bg-slate-50 dark:hover:bg-white/5 border-slate-100 dark:border-white/5">
                                        <TableCell className="pl-6">
                                            <div className="flex items-center gap-2">
                                                <Plane size={13} className="text-blue-500 shrink-0" />
                                                <span className="font-black text-sm text-blue-600 dark:text-blue-400 tracking-tighter">
                                                    {b.pnr ?? '—'}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge className={`font-bold text-xs border ${STATUS_STYLES[b.status] ?? 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                                {b.status.replace(/_/g, ' ')}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <code className="text-xs font-mono text-slate-400">
                                                {b.session_id ? `${b.session_id.slice(0, 8)}…` : '—'}
                                            </code>
                                        </TableCell>
                                        <TableCell>
                                            {b.payment_intent_id ? (
                                                <a href={`https://dashboard.stripe.com/payments/${b.payment_intent_id}`}
                                                    target="_blank" rel="noopener noreferrer"
                                                    className="flex items-center gap-1 text-xs text-blue-500 hover:underline font-mono">
                                                    {b.payment_intent_id.slice(0, 14)}… <ExternalLink size={10} />
                                                </a>
                                            ) : <span className="text-xs text-slate-400">—</span>}
                                        </TableCell>
                                        <TableCell className="pr-6 text-right">
                                            <span className="text-xs text-slate-400">{formatDate(b.created_at)}</span>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>

                    {data.bookings.length === 0 && (
                        <div className="py-16 text-center">
                            <Smartphone size={36} className="mx-auto text-slate-200 dark:text-white/10 mb-3" strokeWidth={1} />
                            <p className="text-sm font-black text-slate-900 dark:text-white">No Duffel bookings yet</p>
                            <p className="text-slate-400 text-xs mt-1">Bookings made via the mobile app will appear here</p>
                        </div>
                    )}

                    <div className="px-6 py-4 flex items-center justify-between border-t border-slate-100 dark:border-white/5 bg-slate-50/30 dark:bg-white/2">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                            Page {data.page} of {data.totalPages || 1} — {data.total} Duffel bookings
                        </p>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => updateParam({ page: data.page - 1 })} disabled={data.page <= 1 || isPending} className="rounded-xl text-xs font-bold">Prev</Button>
                            <Button variant="outline" size="sm" onClick={() => updateParam({ page: data.page + 1 })} disabled={data.page >= data.totalPages || isPending} className="rounded-xl text-xs font-bold text-blue-600">Next</Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
