"use client";

import React, { useState, useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Globe, Search, Plus, Pencil, Trash2, XCircle, MapPin, Check, X } from 'lucide-react';
import { StatCard } from '@/components/admin/StatCard';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';

interface Destination {
    id: string;
    city: string;
    country: string;
    image_url: string | null;
    average_price: number | null;
    created_at: string;
}

interface DestinationsClientProps {
    data: {
        destinations: Destination[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    };
    searchParams: { page: number; q: string };
}

const EMPTY_FORM = { city: '', country: '', image_url: '', average_price: '' };

export function DestinationsClient({ data, searchParams }: DestinationsClientProps) {
    const router = useRouter();
    const pathname = usePathname();
    const currentParams = useSearchParams();
    const [isPending, startTransition] = useTransition();
    const [searchTerm, setSearchTerm] = useState(searchParams.q);
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);

    const updateParam = (params: Record<string, string | number | undefined>) => {
        const next = new URLSearchParams(currentParams.toString());
        Object.entries(params).forEach(([k, v]) => {
            if (v === undefined || v === '') next.delete(k);
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

    const startEdit = (dest: Destination) => {
        setEditingId(dest.id);
        setForm({ city: dest.city, country: dest.country, image_url: dest.image_url ?? '', average_price: dest.average_price?.toString() ?? '' });
        setShowForm(false);
    };

    const cancelEdit = () => { setEditingId(null); setForm(EMPTY_FORM); };

    const handleSave = async (isEdit: boolean, id?: string) => {
        if (!form.city.trim() || !form.country.trim()) { toast.error('City and country are required'); return; }
        setSaving(true);
        try {
            const res = await fetch('/api/admin/destinations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
                body: JSON.stringify({
                    action: isEdit ? 'update' : 'create',
                    ...(isEdit && id ? { id } : {}),
                    city: form.city.trim(),
                    country: form.country.trim(),
                    image_url: form.image_url.trim() || null,
                    average_price: form.average_price ? parseFloat(form.average_price) : null,
                }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            toast.success(isEdit ? 'Destination updated' : 'Destination created');
            setForm(EMPTY_FORM);
            setShowForm(false);
            setEditingId(null);
            startTransition(() => router.refresh());
        } catch (e: any) {
            toast.error(e.message ?? 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this destination?')) return;
        setLoadingId(id);
        try {
            const res = await fetch('/api/admin/destinations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
                body: JSON.stringify({ action: 'delete', id }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            toast.success('Destination deleted');
            startTransition(() => router.refresh());
        } catch (e: any) {
            toast.error(e.message ?? 'Delete failed');
        } finally {
            setLoadingId(null);
        }
    };

    return (
        <div className="space-y-10 pb-20">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <StatCard title="Total Destinations" value={String(data.total)} icon={Globe} variant="white" trend="All featured destinations" />
                <StatCard title="On This Page" value={String(data.destinations.length)} icon={MapPin} variant="white" trend={`Page ${data.page} of ${data.totalPages || 1}`} />
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <Input placeholder="Search city or country…" className="pl-9 h-12 rounded-xl" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
                {searchTerm && (
                    <Button variant="ghost" size="sm" onClick={() => { setSearchTerm(''); updateParam({ q: '', page: 1 }); }} className="text-slate-500 hover:text-rose-500">
                        Reset <XCircle className="ml-1 h-4 w-4" />
                    </Button>
                )}
                <Button onClick={() => { setShowForm(v => !v); setEditingId(null); setForm(EMPTY_FORM); }} className="ml-auto h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs gap-2">
                    <Plus size={14} /> Add Destination
                </Button>
            </div>

            {/* Create form */}
            {showForm && (
                <div className="bg-white dark:bg-obsidian border border-slate-200 dark:border-white/10 rounded-2xl p-6 space-y-4">
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-700 dark:text-white">New Destination</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div><label className="text-xs font-bold text-slate-500 mb-1 block">City *</label><Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="Tokyo" className="rounded-xl h-10" /></div>
                        <div><label className="text-xs font-bold text-slate-500 mb-1 block">Country *</label><Input value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} placeholder="Japan" className="rounded-xl h-10" /></div>
                        <div><label className="text-xs font-bold text-slate-500 mb-1 block">Image URL</label><Input value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} placeholder="https://..." className="rounded-xl h-10" /></div>
                        <div><label className="text-xs font-bold text-slate-500 mb-1 block">Average Price (USD)</label><Input type="number" value={form.average_price} onChange={e => setForm(f => ({ ...f, average_price: e.target.value }))} placeholder="299" className="rounded-xl h-10" /></div>
                    </div>
                    <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }} className="rounded-xl">Cancel</Button>
                        <Button size="sm" disabled={saving} onClick={() => handleSave(false)} className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold">
                            {saving ? 'Saving…' : 'Create'}
                        </Button>
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="bg-white dark:bg-obsidian rounded-2xl overflow-hidden border border-slate-100 dark:border-white/5 shadow-sm">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent border-slate-100 dark:border-white/5">
                                <TableHead className="pl-6">Destination</TableHead>
                                <TableHead>Country</TableHead>
                                <TableHead>Avg. Price</TableHead>
                                <TableHead>Image</TableHead>
                                <TableHead className="pr-6 text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.destinations.map((dest) => (
                                <React.Fragment key={dest.id}>
                                    <TableRow className="hover:bg-slate-50 dark:hover:bg-white/5 border-slate-100 dark:border-white/5">
                                        <TableCell className="pl-6">
                                            <div className="flex items-center gap-3">
                                                {dest.image_url ? (
                                                    <img src={dest.image_url} alt={dest.city} className="w-10 h-10 rounded-xl object-cover shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center shrink-0"><Globe size={16} className="text-slate-400" /></div>
                                                )}
                                                <span className="font-black text-sm text-slate-900 dark:text-white">{dest.city}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell><span className="text-sm text-slate-600 dark:text-slate-300">{dest.country}</span></TableCell>
                                        <TableCell>
                                            {dest.average_price ? (
                                                <span className="text-sm font-bold text-emerald-600">{formatCurrency(dest.average_price, 'USD')}</span>
                                            ) : (
                                                <span className="text-xs text-slate-400 italic">Not set</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {dest.image_url ? (
                                                <span className="text-xs text-blue-500 truncate max-w-[180px] block">✓ Set</span>
                                            ) : (
                                                <span className="text-xs text-slate-400 italic">No image</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="pr-6 text-right">
                                            <div className="flex items-center gap-1 justify-end">
                                                <Button variant="ghost" size="sm" onClick={() => startEdit(dest)} className="h-8 px-2 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10" title="Edit"><Pencil size={14} /></Button>
                                                <Button variant="ghost" size="sm" disabled={loadingId === dest.id} onClick={() => handleDelete(dest.id)} className="h-8 px-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10" title="Delete"><Trash2 size={14} /></Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                    {/* Inline edit row */}
                                    {editingId === dest.id && (
                                        <TableRow className="bg-blue-50/40 dark:bg-blue-900/10 border-slate-100 dark:border-white/5">
                                            <TableCell colSpan={5} className="px-6 py-4">
                                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                                                    <div><label className="text-xs font-bold text-slate-500 mb-1 block">City</label><Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className="rounded-xl h-9 text-sm" /></div>
                                                    <div><label className="text-xs font-bold text-slate-500 mb-1 block">Country</label><Input value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} className="rounded-xl h-9 text-sm" /></div>
                                                    <div><label className="text-xs font-bold text-slate-500 mb-1 block">Image URL</label><Input value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} className="rounded-xl h-9 text-sm" /></div>
                                                    <div><label className="text-xs font-bold text-slate-500 mb-1 block">Avg. Price</label><Input type="number" value={form.average_price} onChange={e => setForm(f => ({ ...f, average_price: e.target.value }))} className="rounded-xl h-9 text-sm" /></div>
                                                </div>
                                                <div className="flex gap-2 mt-3 justify-end">
                                                    <Button variant="ghost" size="sm" onClick={cancelEdit} className="rounded-xl text-slate-500"><X size={14} className="mr-1" />Cancel</Button>
                                                    <Button size="sm" disabled={saving} onClick={() => handleSave(true, dest.id)} className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold"><Check size={14} className="mr-1" />{saving ? 'Saving…' : 'Save'}</Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </React.Fragment>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                {data.destinations.length === 0 && !isPending && (
                    <div className="py-20 text-center">
                        <Globe size={40} className="mx-auto text-slate-200 dark:text-white/10 mb-4" strokeWidth={1} />
                        <h3 className="text-lg font-black text-slate-900 dark:text-white">No destinations found</h3>
                        <p className="text-slate-400 text-sm mt-1">Add your first destination using the button above</p>
                    </div>
                )}

                <div className="px-6 py-4 flex items-center justify-between border-t border-slate-100 dark:border-white/5 bg-slate-50/30 dark:bg-white/2">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Page {data.page} of {data.totalPages || 1} — {data.total} destinations</p>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => updateParam({ page: data.page - 1 })} disabled={data.page <= 1 || isPending} className="rounded-xl text-xs font-bold">Prev</Button>
                        <Button variant="outline" size="sm" onClick={() => updateParam({ page: data.page + 1 })} disabled={data.page >= data.totalPages || isPending} className="rounded-xl text-xs font-bold text-blue-600">Next</Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
