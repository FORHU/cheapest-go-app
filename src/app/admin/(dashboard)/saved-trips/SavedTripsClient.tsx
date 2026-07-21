"use client";

import React, { useState, useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Bookmark, Plane, Building2, Search, XCircle, Trash2, ExternalLink } from 'lucide-react';
import { StatCard } from '@/components/admin/StatCard';
import { Button, Input, Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import { formatDate, formatCurrency } from '@/lib/utils';

interface SavedTrip {
    id: string;
    user_id: string;
    type: 'flight' | 'hotel';
    title: string;
    subtitle: string | null;
    price: number | null;
    currency: string;
    image_url: string | null;
    deep_link: string;
    created_at: string;
}

interface SavedTripsClientProps {
    data: {
        trips: SavedTrip[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
        stats: { total: number; flights: number; hotels: number };
    };
    searchParams: { page: number; q: string; type: string };
}

export function SavedTripsClient({ data, searchParams }: SavedTripsClientProps) {
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

    const handleDelete = async (id: string) => {
        if (!confirm('Remove this saved trip?')) return;
        setLoadingId(id);
        try {
            const res = await fetch('/api/admin/saved-trips', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
                body: JSON.stringify({ action: 'delete', id }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            toast.success('Saved trip removed');
            startTransition(() => router.refresh());
        } catch (e: any) {
            toast.error(e.message ?? 'Delete failed');
        } finally {
            setLoadingId(null);
        }
    };

    const typeOptions = [
        { label: 'All', value: 'all' },
        { label: 'Flights', value: 'flight' },
        { label: 'Hotels', value: 'hotel' },
    ];

    return (
        <div className="space-y-10 pb-20">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <StatCard title="Total Saved" value={String(data.stats.total)} icon={Bookmark} variant="white" trend="All customers" />
                <StatCard title="Flights" value={String(data.stats.flights)} icon={Plane} variant="white" trend="Saved flight offers" />
                <StatCard title="Hotels" value={String(data.stats.hotels)} icon={Building2} variant="white" trend="Saved hotel offers" />
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <Input placeholder="Search title or subtitle…" className="pl-9 h-12 rounded-xl" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
                <div className="flex items-center gap-1 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-1">
                    {typeOptions.map(opt => (
                        <button key={opt.value} onClick={() => updateParam({ type: opt.value })}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${(searchParams.type ?? 'all') === opt.value ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-blue-600'}`}>
                            {opt.label}
                        </button>
                    ))}
                </div>
                {(searchTerm || (searchParams.type && searchParams.type !== 'all')) && (
                    <Button variant="ghost" size="sm" onClick={() => { setSearchTerm(''); updateParam({ q: '', type: 'all', page: 1 }); }} className="text-slate-500 hover:text-rose-500">
                        Reset <XCircle className="ml-1 h-4 w-4" />
                    </Button>
                )}
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-obsidian rounded-2xl overflow-hidden border border-slate-100 dark:border-white/5 shadow-sm">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent border-slate-100 dark:border-white/5">
                                <TableHead className="pl-6">Trip</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Price</TableHead>
                                <TableHead>User ID</TableHead>
                                <TableHead>Saved</TableHead>
                                <TableHead className="pr-6 text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.trips.map((trip) => (
                                <TableRow key={trip.id} className="hover:bg-slate-50 dark:hover:bg-white/5 border-slate-100 dark:border-white/5">
                                    <TableCell className="pl-6">
                                        <div className="flex items-center gap-3">
                                            {trip.image_url ? (
                                                <img src={trip.image_url} alt={trip.title} className="w-10 h-10 rounded-xl object-cover shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                            ) : (
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${trip.type === 'flight' ? 'bg-blue-500/10 text-blue-600' : 'bg-emerald-500/10 text-emerald-600'}`}>
                                                    {trip.type === 'flight' ? <Plane size={16} /> : <Building2 size={16} />}
                                                </div>
                                            )}
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[200px]">{trip.title}</p>
                                                {trip.subtitle && <p className="text-xs text-slate-400 truncate max-w-[200px]">{trip.subtitle}</p>}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge className={trip.type === 'flight' ? 'bg-blue-500/10 text-blue-600 border-blue-500/20 font-bold text-xs' : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-bold text-xs'}>
                                            {trip.type === 'flight' ? 'Flight' : 'Hotel'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        {trip.price ? (
                                            <span className="text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(trip.price, trip.currency)}</span>
                                        ) : (
                                            <span className="text-xs text-slate-400 italic">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-xs font-mono text-slate-400">{trip.user_id.slice(0, 8)}…</span>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-xs text-slate-500">{formatDate(trip.created_at)}</span>
                                    </TableCell>
                                    <TableCell className="pr-6 text-right">
                                        <div className="flex items-center gap-1 justify-end">
                                            <a href={trip.deep_link} target="_blank" rel="noopener noreferrer" title="Open offer">
                                                <Button variant="ghost" size="sm" className="h-8 px-2 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10"><ExternalLink size={14} /></Button>
                                            </a>
                                            <Button variant="ghost" size="sm" disabled={loadingId === trip.id} onClick={() => handleDelete(trip.id)} className="h-8 px-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"><Trash2 size={14} /></Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                {data.trips.length === 0 && !isPending && (
                    <div className="py-20 text-center">
                        <Bookmark size={40} className="mx-auto text-slate-200 dark:text-white/10 mb-4" strokeWidth={1} />
                        <h3 className="text-lg font-black text-slate-900 dark:text-white">No saved trips found</h3>
                        <p className="text-slate-400 text-sm mt-1">Customers haven't saved any trips yet, or try adjusting filters</p>
                    </div>
                )}

                <div className="px-6 py-4 flex items-center justify-between border-t border-slate-100 dark:border-white/5 bg-slate-50/30 dark:bg-white/2">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Page {data.page} of {data.totalPages || 1} — {data.total} saved trips</p>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => updateParam({ page: data.page - 1 })} disabled={data.page <= 1 || isPending} className="rounded-xl text-xs font-bold">Prev</Button>
                        <Button variant="outline" size="sm" onClick={() => updateParam({ page: data.page + 1 })} disabled={data.page >= data.totalPages || isPending} className="rounded-xl text-xs font-bold text-blue-600">Next</Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
