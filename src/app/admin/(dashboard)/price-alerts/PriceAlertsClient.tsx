"use client";

import React, { useState, useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Bell, BellOff, Search, Plane, XCircle, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { StatCard } from '@/components/admin/StatCard';
import { Button, Input, Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import { formatDate } from '@/lib/utils';

interface PriceAlert {
    id: string;
    user_id: string;
    email: string;
    origin: string;
    destination: string;
    cabin_class: string;
    adults: number;
    target_price: number | null;
    is_active: boolean;
    created_at: string;
}

interface PriceAlertsClientProps {
    data: {
        alerts: PriceAlert[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
        stats: { total: number; active: number; inactive: number };
    };
    searchParams: { page: number; q: string; status: string };
}

const CABIN_LABELS: Record<string, string> = {
    economy: 'Economy',
    premium_economy: 'Prem. Economy',
    business: 'Business',
    first: 'First',
};

export function PriceAlertsClient({ data, searchParams }: PriceAlertsClientProps) {
    const router = useRouter();
    const pathname = usePathname();
    const currentParams = useSearchParams();
    const [isPending, startTransition] = useTransition();
    const [searchTerm, setSearchTerm] = useState(searchParams.q);
    const [loadingId, setLoadingId] = useState<string | null>(null);

    const updateParam = (params: Record<string, string | number | undefined>) => {
        const next = new URLSearchParams(currentParams.toString());
        Object.entries(params).forEach(([k, v]) => {
            if (v === undefined || v === '' || v === 'all') next.delete(k);
            else next.set(k, String(v));
        });
        if (!params.page) next.set('page', '1');
        startTransition(() => router.push(`${pathname}?${next.toString()}`));
    };

    React.useEffect(() => {
        const t = setTimeout(() => {
            if (searchTerm !== searchParams.q) updateParam({ q: searchTerm, page: 1 });
        }, 500);
        return () => clearTimeout(t);
    }, [searchTerm]);

    const doAction = async (action: string, id: string) => {
        setLoadingId(id);
        try {
            const res = await fetch('/api/admin/price-alerts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
                body: JSON.stringify({ action, id }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            toast.success(action === 'delete' ? 'Alert deleted' : action === 'activate' ? 'Alert activated' : 'Alert deactivated');
            startTransition(() => router.refresh());
        } catch (e: any) {
            toast.error(e.message ?? 'Action failed');
        } finally {
            setLoadingId(null);
        }
    };

    const statusOptions = [
        { label: 'All', value: 'all' },
        { label: 'Active', value: 'active' },
        { label: 'Inactive', value: 'inactive' },
    ];

    return (
        <div className="space-y-10 pb-20">
            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <StatCard title="Total Alerts" value={String(data.stats.total)} icon={Bell} variant="white" trend="All-time" />
                <StatCard title="Active" value={String(data.stats.active)} icon={ToggleRight} variant="white" trend="Monitoring now" />
                <StatCard title="Inactive" value={String(data.stats.inactive)} icon={ToggleLeft} variant="white" trend="Paused or expired" />
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                <div className="flex flex-1 items-center gap-2 w-full max-w-2xl">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <Input
                            placeholder="Search by route or email…"
                            className="pl-9 h-12 rounded-xl"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="flex items-center gap-1 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-1">
                        {statusOptions.map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => updateParam({ status: opt.value })}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${searchParams.status === opt.value || (opt.value === 'all' && !searchParams.status)
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'text-slate-500 hover:text-blue-600'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    {(searchTerm || (searchParams.status && searchParams.status !== 'all')) && (
                        <Button variant="ghost" size="sm" onClick={() => { setSearchTerm(''); updateParam({ q: '', status: 'all', page: 1 }); }} className="text-slate-500 hover:text-rose-500">
                            Reset <XCircle className="ml-1 h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-obsidian rounded-2xl overflow-hidden border border-slate-100 dark:border-white/5 shadow-sm">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent border-slate-100 dark:border-white/5">
                                <TableHead className="pl-6">Route</TableHead>
                                <TableHead>Customer</TableHead>
                                <TableHead>Cabin</TableHead>
                                <TableHead>Target Price</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead className="pr-6 text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.alerts.map((alert) => (
                                <TableRow key={alert.id} className="hover:bg-slate-50 dark:hover:bg-white/5 border-slate-100 dark:border-white/5">
                                    <TableCell className="pl-6">
                                        <div className="flex items-center gap-2">
                                            <Plane size={14} className="text-blue-500 shrink-0" />
                                            <span className="font-black text-sm text-slate-900 dark:text-white tracking-tight">
                                                {alert.origin} → {alert.destination}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-sm text-slate-600 dark:text-slate-300">{alert.email}</span>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                            {CABIN_LABELS[alert.cabin_class] ?? alert.cabin_class}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        {alert.target_price ? (
                                            <span className="text-sm font-bold text-emerald-600">${alert.target_price}</span>
                                        ) : (
                                            <span className="text-xs text-slate-400">Any price</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Badge className={alert.is_active
                                            ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-bold text-xs'
                                            : 'bg-slate-100 dark:bg-white/5 text-slate-500 border-slate-200 dark:border-white/10 font-bold text-xs'
                                        }>
                                            {alert.is_active ? 'Active' : 'Inactive'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-xs text-slate-500">{formatDate(alert.created_at)}</span>
                                    </TableCell>
                                    <TableCell className="pr-6 text-right">
                                        <div className="flex items-center gap-1 justify-end">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                disabled={loadingId === alert.id}
                                                onClick={() => doAction(alert.is_active ? 'deactivate' : 'activate', alert.id)}
                                                className={`h-8 px-2 rounded-lg text-xs font-bold ${alert.is_active ? 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10' : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'}`}
                                                title={alert.is_active ? 'Deactivate' : 'Activate'}
                                            >
                                                {alert.is_active ? <BellOff size={14} /> : <Bell size={14} />}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                disabled={loadingId === alert.id}
                                                onClick={() => doAction('delete', alert.id)}
                                                className="h-8 px-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                                                title="Delete alert"
                                            >
                                                <Trash2 size={14} />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                {data.alerts.length === 0 && !isPending && (
                    <div className="py-20 text-center">
                        <Bell size={40} className="mx-auto text-slate-200 dark:text-white/10 mb-4" strokeWidth={1} />
                        <h3 className="text-lg font-black text-slate-900 dark:text-white">No price alerts found</h3>
                        <p className="text-slate-400 text-sm mt-1">Try adjusting your filters</p>
                    </div>
                )}

                {/* Pagination */}
                <div className="px-6 py-4 flex items-center justify-between border-t border-slate-100 dark:border-white/5 bg-slate-50/30 dark:bg-white/2">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                        Page {data.page} of {data.totalPages || 1} — {data.total} alerts
                    </p>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => updateParam({ page: data.page - 1 })} disabled={data.page <= 1 || isPending} className="rounded-xl text-xs font-bold">Prev</Button>
                        <Button variant="outline" size="sm" onClick={() => updateParam({ page: data.page + 1 })} disabled={data.page >= data.totalPages || isPending} className="rounded-xl text-xs font-bold text-blue-600">Next</Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
