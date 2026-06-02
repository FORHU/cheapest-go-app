"use client";

import React, { useState, useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Tag, Plane, Building2, Search, XCircle, Trash2, ToggleLeft, ToggleRight, Plus, Check, X, Ticket, Star } from 'lucide-react';
import { StatCard } from '@/components/admin/StatCard';
import { Button, Input, Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import { formatDate, formatCurrency } from '@/lib/utils';

interface DealsClientProps {
    data: {
        items: any[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
        stats: { vouchers: number; activeVouchers: number; flightDeals: number; weekendDeals: number; hotelDeals: number };
    };
    searchParams: { tab: string; page: number; q: string };
}

const TABS = [
    { key: 'vouchers',      label: 'Vouchers',       icon: Ticket    },
    { key: 'flight_deals',  label: 'Flight Deals',   icon: Plane     },
    { key: 'hotel_deals',   label: 'Hotel Deals',    icon: Building2 },
    { key: 'weekend_deals', label: 'Weekend Deals',  icon: Star      },
];

const EMPTY_VOUCHER = { code: '', description: '', discount_type: 'percent', discount_value: '', min_booking_amount: '', usage_limit: '', valid_until: '' };

export function DealsClient({ data, searchParams }: DealsClientProps) {
    const router = useRouter();
    const pathname = usePathname();
    const currentParams = useSearchParams();
    const [isPending, startTransition] = useTransition();
    const [searchTerm, setSearchTerm] = useState(searchParams.q);
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [voucher, setVoucher] = useState(EMPTY_VOUCHER);
    const [saving, setSaving] = useState(false);

    const tab = searchParams.tab ?? 'vouchers';

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

    const post = async (body: object) => {
        const res = await fetch('/api/admin/deals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
            body: JSON.stringify(body),
        });
        return res.json();
    };

    const handleToggleVoucher = async (id: string, active: boolean) => {
        setLoadingId(id);
        try {
            const json = await post({ action: 'toggle_active', tab: 'vouchers', id, active: !active });
            if (!json.success) throw new Error(json.error);
            toast.success(!active ? 'Voucher activated' : 'Voucher deactivated');
            startTransition(() => router.refresh());
        } catch (e: any) { toast.error(e.message ?? 'Action failed'); }
        finally { setLoadingId(null); }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this item?')) return;
        setLoadingId(id);
        try {
            const json = await post({ action: 'delete', tab, id });
            if (!json.success) throw new Error(json.error);
            toast.success('Deleted');
            startTransition(() => router.refresh());
        } catch (e: any) { toast.error(e.message ?? 'Delete failed'); }
        finally { setLoadingId(null); }
    };

    const handleCreateVoucher = async () => {
        if (!voucher.code.trim()) { toast.error('Code is required'); return; }
        if (!voucher.discount_value) { toast.error('Discount value is required'); return; }
        setSaving(true);
        try {
            const json = await post({
                action: 'create', tab: 'vouchers',
                code: voucher.code.toUpperCase().trim(),
                description: voucher.description || null,
                discount_type: voucher.discount_type,
                discount_value: parseFloat(voucher.discount_value),
                min_booking_amount: voucher.min_booking_amount ? parseFloat(voucher.min_booking_amount) : null,
                usage_limit: voucher.usage_limit ? parseInt(voucher.usage_limit) : null,
                valid_until: voucher.valid_until || null,
                active: true,
            });
            if (!json.success) throw new Error(json.error);
            toast.success('Voucher created');
            setVoucher(EMPTY_VOUCHER);
            setShowForm(false);
            startTransition(() => router.refresh());
        } catch (e: any) { toast.error(e.message ?? 'Create failed'); }
        finally { setSaving(false); }
    };

    return (
        <div className="space-y-10 pb-20">
            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-6">
                <StatCard title="Vouchers" value={String(data.stats.vouchers)} icon={Ticket} variant="white" trend={`${data.stats.activeVouchers} active`} />
                <StatCard title="Active Vouchers" value={String(data.stats.activeVouchers)} icon={ToggleRight} variant="white" trend="Live codes" />
                <StatCard title="Flight Deals" value={String(data.stats.flightDeals)} icon={Plane} variant="white" trend="Routes" />
                <StatCard title="Hotel Deals" value={String(data.stats.hotelDeals)} icon={Building2} variant="white" trend="Unique stays" />
                <StatCard title="Weekend Deals" value={String(data.stats.weekendDeals)} icon={Star} variant="white" trend="Packages" />
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-1.5 w-fit">
                {TABS.map(t => {
                    const Icon = t.icon;
                    return (
                        <button key={t.key} onClick={() => updateParam({ tab: t.key, page: 1, q: '' })}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${tab === t.key ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-blue-600'}`}>
                            <Icon size={13} /> {t.label}
                        </button>
                    );
                })}
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <Input
                        placeholder={
                            tab === 'vouchers' ? 'Search code or description…' :
                            tab === 'flight_deals' ? 'Search route or airline…' :
                            tab === 'hotel_deals' ? 'Search name, location or category…' :
                            'Search name or location…'
                        }
                        className="pl-9 h-12 rounded-xl"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                {searchTerm && (
                    <Button variant="ghost" size="sm" onClick={() => { setSearchTerm(''); updateParam({ q: '', page: 1 }); }} className="text-slate-500 hover:text-rose-500">Reset <XCircle className="ml-1 h-4 w-4" /></Button>
                )}
                {tab === 'vouchers' && (
                    <Button onClick={() => setShowForm(v => !v)} className="ml-auto h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs gap-2">
                        <Plus size={14} /> New Voucher
                    </Button>
                )}
            </div>

            {/* Voucher create form */}
            {showForm && tab === 'vouchers' && (
                <div className="bg-white dark:bg-obsidian border border-slate-200 dark:border-white/10 rounded-2xl p-6 space-y-4">
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-700 dark:text-white">Create Voucher</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div><label className="text-xs font-bold text-slate-500 mb-1 block">Code *</label><Input value={voucher.code} onChange={e => setVoucher(v => ({ ...v, code: e.target.value.toUpperCase() }))} placeholder="SAVE20" className="rounded-xl h-10 font-mono" /></div>
                        <div><label className="text-xs font-bold text-slate-500 mb-1 block">Discount Type</label>
                            <select value={voucher.discount_type} onChange={e => setVoucher(v => ({ ...v, discount_type: e.target.value }))} className="w-full h-10 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm px-3 text-slate-900 dark:text-white">
                                <option value="percent">Percentage (%)</option>
                                <option value="fixed">Fixed Amount</option>
                            </select>
                        </div>
                        <div><label className="text-xs font-bold text-slate-500 mb-1 block">Discount Value *</label><Input type="number" value={voucher.discount_value} onChange={e => setVoucher(v => ({ ...v, discount_value: e.target.value }))} placeholder={voucher.discount_type === 'percent' ? '20' : '500'} className="rounded-xl h-10" /></div>
                        <div><label className="text-xs font-bold text-slate-500 mb-1 block">Min. Booking Amount</label><Input type="number" value={voucher.min_booking_amount} onChange={e => setVoucher(v => ({ ...v, min_booking_amount: e.target.value }))} placeholder="1000" className="rounded-xl h-10" /></div>
                        <div><label className="text-xs font-bold text-slate-500 mb-1 block">Usage Limit</label><Input type="number" value={voucher.usage_limit} onChange={e => setVoucher(v => ({ ...v, usage_limit: e.target.value }))} placeholder="100" className="rounded-xl h-10" /></div>
                        <div><label className="text-xs font-bold text-slate-500 mb-1 block">Valid Until</label><Input type="datetime-local" value={voucher.valid_until} onChange={e => setVoucher(v => ({ ...v, valid_until: e.target.value }))} className="rounded-xl h-10" /></div>
                        <div className="sm:col-span-3"><label className="text-xs font-bold text-slate-500 mb-1 block">Description</label><Input value={voucher.description} onChange={e => setVoucher(v => ({ ...v, description: e.target.value }))} placeholder="Welcome discount for new users" className="rounded-xl h-10" /></div>
                    </div>
                    <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => { setShowForm(false); setVoucher(EMPTY_VOUCHER); }} className="rounded-xl">Cancel</Button>
                        <Button size="sm" disabled={saving} onClick={handleCreateVoucher} className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold">{saving ? 'Creating…' : 'Create Voucher'}</Button>
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="bg-white dark:bg-obsidian rounded-2xl overflow-hidden border border-slate-100 dark:border-white/5 shadow-sm">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent border-slate-100 dark:border-white/5">
                                {tab === 'vouchers' && <>
                                    <TableHead className="pl-6">Code</TableHead>
                                    <TableHead>Discount</TableHead>
                                    <TableHead>Usage</TableHead>
                                    <TableHead>Expires</TableHead>
                                    <TableHead>Status</TableHead>
                                </>}
                                {tab === 'flight_deals' && <>
                                    <TableHead className="pl-6">Route</TableHead>
                                    <TableHead>Airline</TableHead>
                                    <TableHead>Cabin</TableHead>
                                    <TableHead>Trip</TableHead>
                                    <TableHead>Price</TableHead>
                                    <TableHead>Discount</TableHead>
                                    <TableHead>Departure</TableHead>
                                </>}
                                {tab === 'weekend_deals' && <>
                                    <TableHead className="pl-6">Property</TableHead>
                                    <TableHead>Location</TableHead>
                                    <TableHead>Rating</TableHead>
                                    <TableHead>Price</TableHead>
                                    <TableHead>Badge</TableHead>
                                </>}
                                {tab === 'hotel_deals' && <>
                                    <TableHead className="pl-6">Property</TableHead>
                                    <TableHead>Location</TableHead>
                                    <TableHead>Category</TableHead>
                                    <TableHead>Rating</TableHead>
                                    <TableHead>Price</TableHead>
                                    <TableHead>Badge</TableHead>
                                </>}
                                <TableHead className="pr-6 text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.items.map((item: any) => (
                                <TableRow key={item.id} className="hover:bg-slate-50 dark:hover:bg-white/5 border-slate-100 dark:border-white/5">
                                    {tab === 'vouchers' && <>
                                        <TableCell className="pl-6"><span className="font-mono font-black text-blue-600 dark:text-blue-400 text-sm">{item.code}</span><p className="text-xs text-slate-400 mt-0.5">{item.description}</p></TableCell>
                                        <TableCell><span className="font-bold text-sm text-slate-900 dark:text-white">{item.discount_type === 'percent' ? `${item.discount_value}%` : formatCurrency(item.discount_value, 'USD')}</span></TableCell>
                                        <TableCell><span className="text-sm text-slate-600 dark:text-slate-300">{item.times_used ?? 0}{item.usage_limit ? ` / ${item.usage_limit}` : ''}</span></TableCell>
                                        <TableCell><span className="text-xs text-slate-500">{item.valid_until ? formatDate(item.valid_until) : 'No expiry'}</span></TableCell>
                                        <TableCell>
                                            <Badge className={item.active ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-bold text-xs' : 'bg-slate-100 dark:bg-white/5 text-slate-500 border-slate-200 dark:border-white/10 font-bold text-xs'}>
                                                {item.active ? 'Active' : 'Inactive'}
                                            </Badge>
                                        </TableCell>
                                    </>}
                                    {tab === 'flight_deals' && <>
                                        <TableCell className="pl-6"><span className="font-black text-sm text-slate-900 dark:text-white">{item.origin} → {item.destination}</span></TableCell>
                                        <TableCell><span className="text-sm text-slate-600 dark:text-slate-300">{item.airline ?? '—'}</span></TableCell>
                                        <TableCell>
                                            <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
                                                item.cabin_class === 'first'           ? 'text-purple-700 bg-purple-500/10' :
                                                item.cabin_class === 'business'        ? 'text-amber-700 bg-amber-500/10' :
                                                item.cabin_class === 'premium_economy' ? 'text-sky-700 bg-sky-500/10' :
                                                'text-slate-500 bg-slate-100 dark:bg-white/5'
                                            }`}>
                                                {item.cabin_class === 'first' ? 'First' :
                                                 item.cabin_class === 'business' ? 'Business' :
                                                 item.cabin_class === 'premium_economy' ? 'Premium' :
                                                 'Economy'}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <span className={`text-xs font-medium px-2 py-1 rounded-lg ${item.return_date ? 'text-blue-600 bg-blue-500/10' : 'text-slate-500 bg-slate-100 dark:bg-white/5'}`}>
                                                {item.return_date ? 'Round-trip' : 'One-way'}
                                            </span>
                                        </TableCell>
                                        <TableCell><span className="font-bold text-emerald-600">{formatCurrency(item.price, item.currency ?? 'USD')}</span></TableCell>
                                        <TableCell><span className="text-xs font-bold text-amber-600 bg-amber-500/10 px-2 py-1 rounded-lg">{item.discount_tag ?? '—'}</span></TableCell>
                                        <TableCell><span className="text-xs text-slate-500">{item.departure_date ?? '—'}</span></TableCell>
                                    </>}
                                    {tab === 'weekend_deals' && <>
                                        <TableCell className="pl-6"><span className="font-bold text-sm text-slate-900 dark:text-white">{item.name}</span></TableCell>
                                        <TableCell><span className="text-sm text-slate-600 dark:text-slate-300">{item.location}</span></TableCell>
                                        <TableCell><span className="text-sm font-bold text-amber-500">★ {item.rating?.toFixed(1) ?? '—'}</span></TableCell>
                                        <TableCell><span className="font-bold text-emerald-600">{formatCurrency(item.sale_price, 'USD')}</span><span className="text-xs text-slate-400 line-through ml-1">{formatCurrency(item.original_price, 'USD')}</span></TableCell>
                                        <TableCell><span className="text-xs font-bold text-blue-600 bg-blue-500/10 px-2 py-1 rounded-lg">{item.badge ?? '—'}</span></TableCell>
                                    </>}
                                    {tab === 'hotel_deals' && <>
                                        <TableCell className="pl-6"><span className="font-bold text-sm text-slate-900 dark:text-white">{item.name}</span></TableCell>
                                        <TableCell><span className="text-sm text-slate-600 dark:text-slate-300">{item.location}</span></TableCell>
                                        <TableCell><span className="text-xs text-slate-500 dark:text-slate-400">{item.category ?? '—'}</span></TableCell>
                                        <TableCell><span className="text-sm font-bold text-amber-500">★ {item.rating?.toFixed(1) ?? '—'}</span></TableCell>
                                        <TableCell><span className="font-bold text-emerald-600">{formatCurrency(item.price ?? 0, 'PHP')}</span></TableCell>
                                        <TableCell><span className="text-xs font-bold text-blue-600 bg-blue-500/10 px-2 py-1 rounded-lg">{item.badge ?? '—'}</span></TableCell>
                                    </>}
                                    <TableCell className="pr-6 text-right">
                                        <div className="flex items-center gap-1 justify-end">
                                            {tab === 'vouchers' && (
                                                <Button variant="ghost" size="sm" disabled={loadingId === item.id} onClick={() => handleToggleVoucher(item.id, item.active)} className={`h-8 px-2 rounded-lg text-xs font-bold ${item.active ? 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10' : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'}`}>
                                                    {item.active ? <ToggleLeft size={14} /> : <ToggleRight size={14} />}
                                                </Button>
                                            )}
                                            <Button variant="ghost" size="sm" disabled={loadingId === item.id} onClick={() => handleDelete(item.id)} className="h-8 px-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"><Trash2 size={14} /></Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                {data.items.length === 0 && !isPending && (
                    <div className="py-20 text-center">
                        <Tag size={40} className="mx-auto text-slate-200 dark:text-white/10 mb-4" strokeWidth={1} />
                        <h3 className="text-lg font-black text-slate-900 dark:text-white">No items found</h3>
                        <p className="text-slate-400 text-sm mt-1">Try adjusting your search or switch tabs</p>
                    </div>
                )}

                <div className="px-6 py-4 flex items-center justify-between border-t border-slate-100 dark:border-white/5 bg-slate-50/30 dark:bg-white/2">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Page {data.page} of {data.totalPages || 1} — {data.total} items</p>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => updateParam({ page: data.page - 1 })} disabled={data.page <= 1 || isPending} className="rounded-xl text-xs font-bold">Prev</Button>
                        <Button variant="outline" size="sm" onClick={() => updateParam({ page: data.page + 1 })} disabled={data.page >= data.totalPages || isPending} className="rounded-xl text-xs font-bold text-blue-600">Next</Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
