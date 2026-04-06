"use client";

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
    CreditCard,
    DollarSign,
    RefreshCw,
    XCircle,
    Hourglass,
    Terminal,
    ChevronDown,
    ChevronRight,
    Filter,
    Search,
    X,
    AlertTriangle
} from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { HeaderTitle } from '@/components/admin/HeaderTitle';
import { StatCard } from '@/components/admin/StatCard';
import { formatCurrency } from '@/lib/utils';
import type { AdvancedAnalyticsData, ApiLogRow } from '@/types/admin';

interface AnalyticsClientProps {
    data: AdvancedAnalyticsData;
    apiLogs: ApiLogRow[];
}

const PROVIDER_COLORS: Record<string, string> = {
    mystifly: 'bg-orange-500/10 text-orange-500',
    mystifly_v2: 'bg-orange-500/10 text-orange-500',
    duffel: 'bg-purple-500/10 text-purple-500',
    stripe: 'bg-indigo-500/10 text-indigo-500',
    cache: 'bg-slate-500/10 text-slate-400',
};

function getStatusColor(status: number | null): string {
    if (!status) return 'text-rose-400';
    if (status < 300) return 'text-emerald-400';
    if (status < 500) return 'text-amber-400';
    return 'text-rose-400';
}

function getDurationColor(ms: number): string {
    if (ms < 1000) return 'text-emerald-400';
    if (ms < 3000) return 'text-amber-400';
    return 'text-rose-400';
}

export function AnalyticsClient({ data, apiLogs }: AnalyticsClientProps) {
    const { providerSuccess, ticketingLatency, errorLogs } = data;

    const [showConsole, setShowConsole] = useState(false);
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [providerFilter, setProviderFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

    const providers = useMemo(() => {
        const set = new Set(apiLogs.map(l => l.provider));
        return Array.from(set).sort();
    }, [apiLogs]);

    const filteredLogs = useMemo(() => {
        return apiLogs.filter(log => {
            if (providerFilter !== 'all' && log.provider !== providerFilter) return false;
            if (statusFilter === 'success' && (log.error_message || !log.response_status || log.response_status >= 400)) return false;
            if (statusFilter === 'error' && !log.error_message && log.response_status && log.response_status < 400) return false;
            if (searchQuery && !log.endpoint.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            return true;
        });
    }, [apiLogs, providerFilter, statusFilter, searchQuery]);

    const stats = useMemo(() => {
        const total = apiLogs.length;
        const errors = apiLogs.filter(l => l.error_message).length;
        const avgDuration = total > 0 ? Math.round(apiLogs.reduce((s, l) => s + l.duration_ms, 0) / total) : 0;
        const slowest = total > 0 ? Math.max(...apiLogs.map(l => l.duration_ms)) : 0;
        return { total, errors, errorRate: total > 0 ? ((errors / total) * 100).toFixed(1) : '0', avgDuration, slowest };
    }, [apiLogs]);

    return (
        <div className="space-y-10 pb-20">
            <HeaderTitle
                actions={
                    <Button variant="outline" className="rounded-xl border-slate-200 dark:border-white/10 dark:bg-white/5 font-bold h-12 px-6 hover:bg-slate-50 transition-all gap-2">
                        <BarChart3 size={18} />
                        Generating Report
                    </Button>
                }
            />


            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
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
                    transition={{ delay: 0.2 }}
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

                <button
                    onClick={() => setShowConsole(prev => !prev)}
                    className="w-full mt-8 py-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-950 hover:bg-slate-900 transition-all group flex items-center justify-center gap-3 cursor-pointer"
                >
                    <Terminal size={14} className="text-emerald-500 group-hover:text-emerald-400 transition-colors" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 group-hover:text-emerald-400 font-mono transition-colors">
                        {showConsole ? 'Close Debug Console' : 'Enter Debug Console'}
                    </span>
                    <span className="w-2 h-4 bg-emerald-500 animate-pulse rounded-sm" />
                </button>
            </motion.div>

            {/* Debug Console */}
            <AnimatePresence>
                {showConsole && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="bg-slate-950 border border-slate-800 rounded-xl shadow-2xl overflow-hidden">
                            {/* Console Header */}
                            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="flex gap-1.5">
                                        <div className="w-3 h-3 rounded-full bg-rose-500" />
                                        <div className="w-3 h-3 rounded-full bg-amber-500" />
                                        <div className="w-3 h-3 rounded-full bg-emerald-500" />
                                    </div>
                                    <span className="text-xs font-mono font-bold text-slate-400">api-debug-console</span>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowConsole(false)}
                                    className="text-slate-500 hover:text-white hover:bg-slate-800 h-7 w-7 p-0"
                                >
                                    <X size={14} />
                                </Button>
                            </div>

                            {/* Stats Bar */}
                            <div className="px-6 py-3 border-b border-slate-800/50 flex items-center gap-6 bg-slate-900/50">
                                <div className="flex items-center gap-2">
                                    <Activity size={12} className="text-emerald-400" />
                                    <span className="text-[10px] font-mono text-slate-400">
                                        Total: <span className="text-white font-bold">{stats.total}</span>
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <AlertTriangle size={12} className="text-rose-400" />
                                    <span className="text-[10px] font-mono text-slate-400">
                                        Errors: <span className="text-rose-400 font-bold">{stats.errors}</span> ({stats.errorRate}%)
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Clock size={12} className="text-amber-400" />
                                    <span className="text-[10px] font-mono text-slate-400">
                                        Avg: <span className="text-white font-bold">{stats.avgDuration}ms</span>
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Hourglass size={12} className="text-rose-400" />
                                    <span className="text-[10px] font-mono text-slate-400">
                                        Slowest: <span className="text-rose-400 font-bold">{(stats.slowest / 1000).toFixed(1)}s</span>
                                    </span>
                                </div>
                            </div>

                            {/* Filters */}
                            <div className="px-6 py-3 border-b border-slate-800/50 flex items-center gap-4 flex-wrap">
                                <div className="flex items-center gap-2">
                                    <Filter size={12} className="text-slate-500" />
                                    <select
                                        value={providerFilter}
                                        onChange={e => setProviderFilter(e.target.value)}
                                        className="bg-slate-800 text-slate-300 text-[11px] font-mono rounded-lg border border-slate-700 px-2 py-1.5 focus:outline-none focus:border-emerald-500"
                                    >
                                        <option value="all">All Providers</option>
                                        {providers.map(p => (
                                            <option key={p} value={p}>{p}</option>
                                        ))}
                                    </select>
                                </div>
                                <select
                                    value={statusFilter}
                                    onChange={e => setStatusFilter(e.target.value)}
                                    className="bg-slate-800 text-slate-300 text-[11px] font-mono rounded-lg border border-slate-700 px-2 py-1.5 focus:outline-none focus:border-emerald-500"
                                >
                                    <option value="all">All Status</option>
                                    <option value="success">Success Only</option>
                                    <option value="error">Errors Only</option>
                                </select>
                                <div className="flex items-center gap-2 flex-1 max-w-xs">
                                    <Search size={12} className="text-slate-500" />
                                    <input
                                        type="text"
                                        placeholder="Search endpoint..."
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        className="bg-slate-800 text-slate-300 text-[11px] font-mono rounded-lg border border-slate-700 px-2 py-1.5 w-full focus:outline-none focus:border-emerald-500 placeholder:text-slate-600"
                                    />
                                </div>
                                <span className="text-[10px] font-mono text-slate-500 ml-auto">
                                    {filteredLogs.length} / {apiLogs.length} entries
                                </span>
                            </div>

                            {/* Log Table */}
                            <div className="max-h-[600px] overflow-y-auto">
                                <table className="w-full">
                                    <thead className="sticky top-0 bg-slate-900 z-10">
                                        <tr>
                                            <th className="text-left py-2 px-6 text-[9px] font-mono font-bold uppercase tracking-widest text-slate-500 w-8"></th>
                                            <th className="text-left py-2 px-2 text-[9px] font-mono font-bold uppercase tracking-widest text-slate-500">Time</th>
                                            <th className="text-left py-2 px-2 text-[9px] font-mono font-bold uppercase tracking-widest text-slate-500">Provider</th>
                                            <th className="text-left py-2 px-2 text-[9px] font-mono font-bold uppercase tracking-widest text-slate-500">Method</th>
                                            <th className="text-left py-2 px-2 text-[9px] font-mono font-bold uppercase tracking-widest text-slate-500">Endpoint</th>
                                            <th className="text-right py-2 px-2 text-[9px] font-mono font-bold uppercase tracking-widest text-slate-500">Status</th>
                                            <th className="text-right py-2 px-2 text-[9px] font-mono font-bold uppercase tracking-widest text-slate-500">Duration</th>
                                            <th className="text-left py-2 px-6 text-[9px] font-mono font-bold uppercase tracking-widest text-slate-500">Error</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredLogs.length === 0 ? (
                                            <tr>
                                                <td colSpan={8} className="text-center py-12 text-slate-500 font-mono text-xs">
                                                    {apiLogs.length === 0 ? 'No API logs recorded yet.' : 'No logs match the current filters.'}
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredLogs.map(log => (
                                                <React.Fragment key={log.id}>
                                                    <tr
                                                        onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                                                        className={`cursor-pointer border-t border-slate-800/50 transition-colors ${
                                                            log.error_message ? 'hover:bg-rose-950/30' : 'hover:bg-slate-800/50'
                                                        } ${expandedRow === log.id ? (log.error_message ? 'bg-rose-950/20' : 'bg-slate-800/30') : ''}`}
                                                    >
                                                        <td className="py-2.5 px-6 text-slate-500">
                                                            {expandedRow === log.id
                                                                ? <ChevronDown size={12} />
                                                                : <ChevronRight size={12} />
                                                            }
                                                        </td>
                                                        <td className="py-2.5 px-2">
                                                            <span className="text-[11px] font-mono text-slate-400">
                                                                {new Date(log.created_at).toLocaleTimeString()}
                                                            </span>
                                                        </td>
                                                        <td className="py-2.5 px-2">
                                                            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${PROVIDER_COLORS[log.provider] || 'bg-slate-700/50 text-slate-300'}`}>
                                                                {log.provider}
                                                            </span>
                                                        </td>
                                                        <td className="py-2.5 px-2">
                                                            <span className="text-[10px] font-mono font-bold text-slate-500">
                                                                {log.method}
                                                            </span>
                                                        </td>
                                                        <td className="py-2.5 px-2">
                                                            <span className="text-[11px] font-mono text-emerald-400 truncate block max-w-[280px]" title={log.endpoint}>
                                                                {log.endpoint.length > 50 ? '...' + log.endpoint.slice(-47) : log.endpoint}
                                                            </span>
                                                        </td>
                                                        <td className="py-2.5 px-2 text-right">
                                                            <span className={`text-[11px] font-mono font-bold ${getStatusColor(log.response_status)}`}>
                                                                {log.response_status || '---'}
                                                            </span>
                                                        </td>
                                                        <td className="py-2.5 px-2 text-right">
                                                            <span className={`text-[11px] font-mono font-bold ${getDurationColor(log.duration_ms)}`}>
                                                                {log.duration_ms >= 1000 ? `${(log.duration_ms / 1000).toFixed(1)}s` : `${log.duration_ms}ms`}
                                                            </span>
                                                        </td>
                                                        <td className="py-2.5 px-6">
                                                            {log.error_message ? (
                                                                <span className="text-[10px] font-mono text-rose-400 truncate block max-w-[200px]" title={log.error_message}>
                                                                    {log.error_message.slice(0, 40)}{log.error_message.length > 40 ? '...' : ''}
                                                                </span>
                                                            ) : (
                                                                <span className="text-[10px] font-mono text-emerald-500/50">OK</span>
                                                            )}
                                                        </td>
                                                    </tr>

                                                    {/* Expanded Detail Row */}
                                                    {expandedRow === log.id && (
                                                        <tr>
                                                            <td colSpan={8} className="bg-slate-900/80 px-6 py-4 border-t border-slate-800/30">
                                                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                                                    <div>
                                                                        <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-slate-500 mb-1">Full Endpoint</p>
                                                                        <p className="text-[11px] font-mono text-emerald-400 break-all">{log.endpoint}</p>
                                                                    </div>
                                                                    <div className="flex gap-6">
                                                                        {log.user_id && (
                                                                            <div>
                                                                                <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-slate-500 mb-1">User ID</p>
                                                                                <p className="text-[11px] font-mono text-slate-300">{log.user_id}</p>
                                                                            </div>
                                                                        )}
                                                                        {log.search_id && (
                                                                            <div>
                                                                                <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-slate-500 mb-1">Search ID</p>
                                                                                <p className="text-[11px] font-mono text-slate-300">{log.search_id}</p>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    {log.error_message && (
                                                                        <div className="lg:col-span-2">
                                                                            <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-rose-400 mb-1">Error Message</p>
                                                                            <p className="text-[11px] font-mono text-rose-300 break-all">{log.error_message}</p>
                                                                        </div>
                                                                    )}
                                                                    {log.request_params && Object.keys(log.request_params).length > 0 && (
                                                                        <div>
                                                                            <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-slate-500 mb-1">Request Params</p>
                                                                            <pre className="text-[10px] font-mono text-slate-300 bg-slate-800/50 rounded-lg p-3 overflow-auto max-h-48 border border-slate-700/50">
                                                                                {JSON.stringify(log.request_params, null, 2)}
                                                                            </pre>
                                                                        </div>
                                                                    )}
                                                                    {log.response_summary && Object.keys(log.response_summary).length > 0 && (
                                                                        <div>
                                                                            <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-slate-500 mb-1">Response Summary</p>
                                                                            <pre className="text-[10px] font-mono text-slate-300 bg-slate-800/50 rounded-lg p-3 overflow-auto max-h-48 border border-slate-700/50">
                                                                                {JSON.stringify(log.response_summary, null, 2)}
                                                                            </pre>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
