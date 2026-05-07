"use client";
import React, { useState, useTransition, useEffect } from 'react';

import {
    Search, RefreshCw, Mail, AlertCircle, CheckCircle2, 
    Clock, Filter, ArrowUpRight, Loader2, ChevronLeft, ChevronRight
} from 'lucide-react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Badge,
    Button,
    Input,
} from '@/components/ui';
import { formatCurrency, cn } from '@/lib/utils';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

export interface EmailLog {
    id: string;
    booking_id: string;
    recipient: string;
    subject: string;
    email_type: string;
    status: 'queued' | 'sent' | 'failed';
    error_message?: string;
    metadata: any;
    created_at: string;
    sent_at: string | null;
}

interface CommunicationClientProps {
    data: {
        logs: EmailLog[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    };
}

export function CommunicationClient({ data }: CommunicationClientProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();
    const [isRetrying, setIsRetrying] = useState<string | null>(null);

    const logs = data.logs;
    const currentPage = data.page;
    const totalPages = data.totalPages;

    const updateSearchParam = (params: Record<string, string | number | undefined>) => {
        const next = new URLSearchParams(searchParams.toString());
        Object.entries(params).forEach(([key, value]) => {
            if (value === undefined || value === 'all' || value === '') {
                next.delete(key);
            } else {
                next.set(key, String(value));
            }
        });
        if (!params.page && next.get('page')) next.set('page', '1');
        
        startTransition(() => {
            router.push(`${pathname}?${next.toString()}`);
        });
    };

    const handleRetry = async (logId: string) => {
        setIsRetrying(logId);
        try {
            const res = await fetch('/api/admin/communication', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'retry', logId }),
            });
            const result = await res.json();
            if (result.success) {
                toast.success('Email resent successfully');
                router.refresh();
            } else {
                toast.error(result.error || 'Failed to resend email');
            }
        } catch (error) {
            toast.error('An error occurred while retrying');
        } finally {
            setIsRetrying(null);
        }
    };

    const formatDate = (date: string) => {
        return new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(date));
    };

    const formatTime = (date: string) => {
        return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(date));
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'sent':
                return <Badge variant="success" className="w-32 justify-center text-center whitespace-nowrap bg-emerald-500/10 text-emerald-500 border-emerald-500/20 font-medium text-[10px] px-2 py-0.5 rounded"><CheckCircle2 className="w-3 h-3 mr-1 shrink-0" /> Sent</Badge>;
            case 'failed':
                return <Badge variant="destructive" className="w-32 justify-center text-center whitespace-nowrap bg-rose-500/10 text-rose-500 border-rose-500/20 font-medium text-[10px] px-2 py-0.5 rounded"><AlertCircle className="w-3 h-3 mr-1 shrink-0" /> Failed</Badge>;
            case 'queued':
                return <Badge variant="warning" className="w-32 justify-center text-center whitespace-nowrap bg-amber-500/10 text-amber-500 border-amber-500/20 font-medium text-[10px] px-2 py-0.5 rounded"><Clock className="w-3 h-3 mr-1 shrink-0" /> Queued</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    const getTypeLabel = (type: string) => {
        return type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ');
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center justify-end mb-4">
                <Button 
                    variant="outline" 
                    onClick={() => router.refresh()}
                    disabled={isPending}
                >
                    <RefreshCw className={cn("w-4 h-4 mr-2", isPending && "animate-spin")} />
                    Refresh
                </Button>
            </div>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input 
                        placeholder="Search Booking ID..." 
                        className="pl-9"
                        defaultValue={searchParams.get('bookingId') || ''}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                updateSearchParam({ bookingId: e.currentTarget.value });
                            }
                        }}
                    />
                </div>
                
                <select 
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:ring-offset-slate-950 dark:focus-visible:ring-slate-300"
                    value={searchParams.get('type') || 'all'}
                    onChange={(e) => updateSearchParam({ type: e.target.value })}
                >
                    <option value="all">All Types</option>
                    <option value="confirmation">Confirmation</option>
                    <option value="ticketed">Ticketed</option>
                    <option value="awaiting_ticket">Awaiting Ticket</option>
                    <option value="refund">Refund</option>
                    <option value="cancellation">Cancellation</option>
                </select>

                <select 
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:ring-offset-slate-950 dark:focus-visible:ring-slate-300"
                    value={searchParams.get('status') || 'all'}
                    onChange={(e) => updateSearchParam({ status: e.target.value })}
                >
                    <option value="all">All Statuses</option>
                    <option value="sent">Sent</option>
                    <option value="failed">Failed</option>
                    <option value="queued">Queued</option>
                </select>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Date / Time</TableHead>
                            <TableHead>Booking ID</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Recipient</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {logs.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-32 text-center text-slate-500">
                                    No communication logs found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            logs.map((log) => (
                                <TableRow key={log.id}>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-medium">{formatDate(log.created_at)}</span>
                                            <span className="text-xs text-slate-500">{formatTime(log.created_at)}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center group">
                                            <code className="text-xs bg-slate-100 dark:bg-white/5 px-1.5 py-0.5 rounded text-indigo-600 dark:text-indigo-400">
                                                {log.booking_id.slice(0, 8).toUpperCase()}
                                            </code>
                                            <Button variant="ghost" size="icon" className="w-6 h-6 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <ArrowUpRight className="w-3 h-3" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-sm font-medium">{getTypeLabel(log.email_type)}</span>
                                    </TableCell>
                                    <TableCell>
                                        <div className="max-w-[200px] truncate" title={log.recipient}>
                                            {log.recipient}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-1">
                                            {getStatusBadge(log.status)}
                                            {log.error_message && (
                                                <span className="text-[10px] text-rose-500 max-w-[150px] truncate" title={log.error_message}>
                                                    {log.error_message}
                                                </span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button 
                                            variant="ghost" 
                                            size="sm"
                                            className="text-slate-600 dark:text-slate-400 hover:text-indigo-600"
                                            onClick={() => handleRetry(log.id)}
                                            disabled={isRetrying === log.id}
                                        >
                                            {isRetrying === log.id ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <RefreshCw className="w-4 h-4 mr-1" />
                                            )}
                                            Retry
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>

                {/* Pagination */}
                <div className="flex items-center justify-between px-4 py-4 border-t border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/5">
                    <div className="text-sm text-slate-500">
                        Showing page {currentPage} of {totalPages}
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={currentPage <= 1 || isPending}
                            onClick={() => updateSearchParam({ page: currentPage - 1 })}
                        >
                            <ChevronLeft className="w-4 h-4 mr-1" /> Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={currentPage >= totalPages || isPending}
                            onClick={() => updateSearchParam({ page: currentPage + 1 })}
                        >
                            Next <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
