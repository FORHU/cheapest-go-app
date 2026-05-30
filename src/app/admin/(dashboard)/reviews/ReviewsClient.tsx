"use client";

import React, { useState, useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Star, Search, XCircle, Trash2, Building2, MessageSquare } from 'lucide-react';
import { StatCard } from '@/components/admin/StatCard';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import { formatDate } from '@/lib/utils';

interface HotelReview {
    id: string;
    hotel_id: string;
    reviewer_name: string | null;
    rating: number | null;
    review_text: string | null;
    source: string | null;
    created_at: string;
}

interface ReviewsClientProps {
    data: {
        reviews: HotelReview[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
        stats: { total: number; lastWeek: number };
    };
    searchParams: { page: number; q: string };
}

function StarRating({ rating }: { rating: number | null }) {
    if (rating == null) return <span className="text-xs text-slate-400">No rating</span>;
    const full = Math.round(rating);
    return (
        <div className="flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} size={12} className={i < full ? 'text-amber-400 fill-amber-400' : 'text-slate-200 dark:text-white/10'} />
            ))}
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300 ml-1">{rating.toFixed(1)}</span>
        </div>
    );
}

export function ReviewsClient({ data, searchParams }: ReviewsClientProps) {
    const router = useRouter();
    const pathname = usePathname();
    const currentParams = useSearchParams();
    const [isPending, startTransition] = useTransition();
    const [searchTerm, setSearchTerm] = useState(searchParams.q);
    const [loadingId, setLoadingId] = useState<string | null>(null);

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

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this review? This cannot be undone.')) return;
        setLoadingId(id);
        try {
            const res = await fetch('/api/admin/reviews', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
                body: JSON.stringify({ action: 'delete', id }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            toast.success('Review deleted');
            startTransition(() => router.refresh());
        } catch (e: any) {
            toast.error(e.message ?? 'Delete failed');
        } finally {
            setLoadingId(null);
        }
    };

    return (
        <div className="space-y-10 pb-20">
            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <StatCard title="Total Reviews" value={String(data.stats.total)} icon={MessageSquare} variant="white" trend="All hotels" />
                <StatCard title="Added This Week" value={String(data.stats.lastWeek)} icon={Star} variant="white" trend="Last 7 days" />
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <Input
                        placeholder="Search by hotel ID or reviewer…"
                        className="pl-9 h-12 rounded-xl"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                {searchTerm && (
                    <Button variant="ghost" size="sm" onClick={() => { setSearchTerm(''); updateParam({ q: '', page: 1 }); }} className="text-slate-500 hover:text-rose-500">
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
                                <TableHead className="pl-6">Hotel ID</TableHead>
                                <TableHead>Reviewer</TableHead>
                                <TableHead>Rating</TableHead>
                                <TableHead>Review</TableHead>
                                <TableHead>Source</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead className="pr-6 text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.reviews.map((review) => (
                                <TableRow key={review.id} className="hover:bg-slate-50 dark:hover:bg-white/5 border-slate-100 dark:border-white/5">
                                    <TableCell className="pl-6">
                                        <div className="flex items-center gap-2">
                                            <Building2 size={14} className="text-slate-400 shrink-0" />
                                            <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">{review.hotel_id}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-sm text-slate-700 dark:text-slate-300">{review.reviewer_name ?? '—'}</span>
                                    </TableCell>
                                    <TableCell>
                                        <StarRating rating={review.rating} />
                                    </TableCell>
                                    <TableCell>
                                        <p className="text-xs text-slate-500 max-w-xs truncate" title={review.review_text ?? ''}>
                                            {review.review_text ?? <span className="italic text-slate-400">No text</span>}
                                        </p>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{review.source ?? '—'}</span>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-xs text-slate-400">{formatDate(review.created_at)}</span>
                                    </TableCell>
                                    <TableCell className="pr-6 text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={loadingId === review.id}
                                            onClick={() => handleDelete(review.id)}
                                            className="h-8 px-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                                            title="Delete review"
                                        >
                                            <Trash2 size={14} />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                {data.reviews.length === 0 && !isPending && (
                    <div className="py-20 text-center">
                        <Star size={40} className="mx-auto text-slate-200 dark:text-white/10 mb-4" strokeWidth={1} />
                        <h3 className="text-lg font-black text-slate-900 dark:text-white">No reviews found</h3>
                        <p className="text-slate-400 text-sm mt-1">Try adjusting your search</p>
                    </div>
                )}

                {/* Pagination */}
                <div className="px-6 py-4 flex items-center justify-between border-t border-slate-100 dark:border-white/5 bg-slate-50/30 dark:bg-white/2">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                        Page {data.page} of {data.totalPages || 1} — {data.total} reviews
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
