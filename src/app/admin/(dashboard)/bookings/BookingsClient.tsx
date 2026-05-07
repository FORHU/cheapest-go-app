"use client";
import React, { useState, useTransition, useMemo, useEffect } from 'react';

import {
    Search, SlidersHorizontal, ArrowUpDown, ChevronDown, CheckCircle2,
    XCircle, Filter, Download, Plus, LayoutDashboard, LayoutList, ArrowUpRight,
    Loader2, AlertTriangle, RefreshCw, ExternalLink, ShieldAlert, Clock,
    Plane, Building2, Activity
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
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuCheckboxItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from '@/components/ui';
import { motion, AnimatePresence } from 'framer-motion';
import { formatCurrency, formatDate, cn, formatStatus } from '@/lib/utils';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { PaginatedBookings } from '@/lib/server/admin';
import { MonitoringData, Booking } from '@/types/admin';
import { BookingDetailsDialog } from './BookingDetailsDialog';
import { toast } from 'sonner';
import { DataTableFacetedFilter } from './DataTableFacetedFilter';

interface BookingsClientProps {
    data: PaginatedBookings;
    searchParams: {
        page: number;
        q: string;
        status: string;
        supplier: string;
        payment: string;
        type: string;
    };
}

const Countdown = ({ targetDate }: { targetDate: string | null }) => {
    const [timeLeft, setTimeLeft] = useState<string>('');
    const [isNearExpiry, setIsNearExpiry] = useState(false);

    useEffect(() => {
        if (!targetDate) {
            setTimeLeft('No limit set');
            return;
        }

        const interval = setInterval(() => {
            const now = new Date().getTime();
            const target = new Date(targetDate).getTime();
            const distance = target - now;

            if (distance < 0) {
                setTimeLeft('EXPIRED');
                setIsNearExpiry(true);
                clearInterval(interval);
                return;
            }

            // less than 2 hours = near expiry
            if (distance < 2 * 60 * 60 * 1000) {
                setIsNearExpiry(true);
            } else {
                setIsNearExpiry(false);
            }

            const h = Math.floor(distance / (1000 * 60 * 60));
            const m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const s = Math.floor((distance % (1000 * 60)) / 1000);

            setTimeLeft(`${h}h ${m}m ${s}s`);
        }, 1000);

        return () => clearInterval(interval);
    }, [targetDate]);

    return (
        <span className={isNearExpiry ? 'text-amber-600 font-bold text-xs' : 'text-slate-600 text-xs'}>
            {timeLeft}
        </span>
    );
};

export function BookingsClient({ data, searchParams }: BookingsClientProps) {
    const router = useRouter();
    const pathname = usePathname();
    const currentSearchParams = useSearchParams();
    const [isPending, startTransition] = React.useTransition();
    const [viewMode, setViewMode] = useState<'list' | 'monitoring'>('list');
    const [monitoringData, setMonitoringData] = useState<MonitoringData | null>(null);
    const [monitoringLoading, setMonitoringLoading] = useState(false);

    // Local state for immediate UI feedback (search input)
    const [searchTerm, setSearchTerm] = useState(searchParams.q);

    // Derived values from props (Server Data)
    const initialBookings = data.bookings;
    const totalPages = data.totalPages;
    const currentPage = data.page;
    const totalCount = data.total;

    // Filter values from URL
    const statusFilter = searchParams.status;
    const supplierFilter = searchParams.supplier;
    const paymentFilter = searchParams.payment;
    const typeFilter = searchParams.type;

    const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

    const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set([
        'bookingRef',
        'customer',
        'ticketId',
        'status',
        'ticketStatus',
        'createdAt'
    ]));

    const toggleColumn = (columnId: string) => {
        const newVisible = new Set(visibleColumns);
        if (newVisible.has(columnId)) {
            if (newVisible.size > 1) { // Prevent hiding all columns
                newVisible.delete(columnId);
            }
        } else {
            newVisible.add(columnId);
        }
        setVisibleColumns(newVisible);
    };

    const COLUMNS = [
        { id: 'bookingRef', label: 'Ref / PNR' },
        { id: 'customer', label: 'Customer' },
        { id: 'ticketId', label: 'Ticket ID' },
        { id: 'ticketStatus', label: 'Tkt Status' },
        { id: 'type', label: 'Type & Supplier' },
        { id: 'amount', label: 'Amount' },
        { id: 'status', label: 'Booking Status' },
        { id: 'payment', label: 'Payment' },
        { id: 'createdAt', label: 'Date Created' },
    ];

    // Helper to update URL
    const updateSearchParam = (params: Record<string, string | number | undefined>) => {
        const next = new URLSearchParams(currentSearchParams.toString());

        Object.entries(params).forEach(([key, value]) => {
            if (value === undefined || value === 'all' || value === '') {
                next.delete(key);
            } else {
                next.set(key, String(value));
            }
        });

        // Always reset to page 1 when filters change (unless updating page itself)
        if (!params.page && next.get('page')) {
            next.set('page', '1');
        }

        startTransition(() => {
            router.push(`${pathname}?${next.toString()}`);
        });
    };

    // Debounce search update
    React.useEffect(() => {
        const timer = setTimeout(() => {
            if (searchTerm !== searchParams.q) {
                updateSearchParam({ q: searchTerm, page: 1 });
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Update local search if URL changes externally
    React.useEffect(() => {
        setSearchTerm(searchParams.q);
    }, [searchParams.q]);

    // Sync selected booking with updated data (prevents stale modal state)
    React.useEffect(() => {
        if (selectedBooking) {
            const updated = data.bookings.find(b => b.id === selectedBooking.id);
            if (updated) {
                setSelectedBooking(updated);
            }
        }
    }, [data.bookings]);

    const fetchMonitoringData = async () => {
        setMonitoringLoading(true);
        try {
            const res = await fetch('/api/admin/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'monitoring' })
            });
            const result = await res.json();
            if (result.success) {
                setMonitoringData(result.data);
            } else {
                toast.error('Failed to load monitoring data');
            }
        } catch (e) {
            toast.error('Network error loading monitoring data');
        } finally {
            setMonitoringLoading(false);
        }
    };

    const handleExport = () => {
        try {
            // Convert bookings to CSV
            const headers = ['Booking ID', 'Type', 'Status', 'Supplier', 'Customer', 'Email', 'Total', 'Currency', 'Payment Status', 'Created At'];
            const rows = data.bookings.map((booking: any) => [
                booking.id || booking.booking_id,
                booking.booking_type === 'flight' ? 'Flight' : 'Hotel',
                booking.status,
                booking.supplier || 'N/A',
                booking.customer_name || `${booking.passenger_name || ''} ${booking.holder_name || ''}`.trim(),
                booking.customer_email || booking.passenger_email || booking.holder_email || '',
                booking.total || booking.total_price || 0,
                booking.currency || 'PHP',
                booking.payment_status || 'N/A',
                formatDate(new Date(booking.created_at), { dateStyle: 'medium', timeStyle: 'short' })
            ]);

            const csvContent = [
                headers.join(','),
                ...rows.map((row: any[]) => row.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            ].join('\n');

            // Create download link
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `bookings-export-${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            toast.success(`Exported ${data.bookings.length} bookings`);
        } catch (error) {
            console.error('Export failed:', error);
            toast.error('Failed to export bookings');
        }
    };

    const handleRetry = (sessionId: string) => {
        startTransition(async () => {
            try {
                const res = await fetch('/api/admin/bookings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'retry_booking', bookingId: sessionId })
                });
                const result = await res.json();
                if (result.success) {
                    toast.success(result.message);
                    fetchMonitoringData();
                } else {
                    toast.error(result.message || 'Retry failed');
                }
            } catch (e) {
                toast.error('Network error during retry');
            }
        });
    };

    const handleCancelAwaiting = (bookingId: string) => {
        if (!confirm('Are you sure you want to cancel and refund this booking before the ticketing expiry?')) return;
        
        startTransition(async () => {
            try {
                const res = await fetch('/api/admin/bookings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'cancel_awaiting_ticket', bookingId })
                });
                const result = await res.json();
                if (result.success) {
                    toast.success(result.message);
                    fetchMonitoringData();
                } else {
                    toast.error(result.message || 'Cancel failed');
                }
            } catch (e) {
                toast.error('Network error during cancel action');
            }
        });
    };

    const paginatedBookings = initialBookings;

    const getStatusVariant = (status: string) => {
        const s = status.toLowerCase();
        if (s.includes('confirm') || s.includes('ticket')) return 'default';
        if (s.includes('pend')) return 'secondary';
        if (s.includes('cancel') || s.includes('fail')) return 'destructive';
        return 'outline';
    };

    const getPaymentVariant = (status: string) => {
        const s = status.toLowerCase();
        if (s === 'paid') return 'default';
        if (s.includes('partial')) return 'secondary';
        if (s === 'unpaid') return 'destructive';
        if (s === 'refunded') return 'outline';
        if (s === 'cancelled') return 'secondary';
        return 'ghost';
    };

    const getSupplierColor = (supplier: string) => {
        const s = supplier.toLowerCase();
        if (s.includes('mystifly')) return 'text-blue-500';
        if (s.includes('booking')) return 'text-blue-600';
        if (s.includes('ratehawk')) return 'text-blue-400';
        if (s.includes('duffel')) return 'text-blue-600';
        return 'text-slate-500';
    };

    return (
        <div className="space-y-10 pb-20">
            <div className="flex items-center justify-end gap-3">
                <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-xl border border-slate-200 dark:border-white/10 shrink-0">
                    <button
                        onClick={() => setViewMode('list')}
                        className={cn(
                            "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                            viewMode === 'list'
                                ? "bg-white dark:bg-white/10 text-blue-600 shadow-sm"
                                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                        )}
                    >
                        All Bookings
                    </button>
                    <button
                        onClick={() => {
                            setViewMode('monitoring');
                            if (!monitoringData) fetchMonitoringData();
                        }}
                        className={cn(
                            "px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                            viewMode === 'monitoring'
                                ? "bg-white dark:bg-white/10 text-blue-600 shadow-sm"
                                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                        )}
                    >
                        <Activity size={12} />
                        Monitoring
                        {monitoringData?.stats.mismatchCount ? (
                            <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[8px] flex items-center justify-center animate-pulse">
                                {monitoringData.stats.mismatchCount}
                            </span>
                        ) : null}
                    </button>
                </div>
                <Button
                    variant="outline"
                    className="rounded-xl border-slate-200 dark:border-white/10 dark:bg-white/5 font-normal h-12 px-6 hover:bg-slate-50 transition-all gap-2"
                    onClick={handleExport}
                >
                    <Download size={18} />
                    Export
                </Button>
            </div>

            <div className="space-y-6">
                <AnimatePresence mode="wait">
                    {viewMode === 'list' ? (
                        <motion.div
                            key="list-view"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                        >
                            <div className="space-y-6">
                                {/* Search and Faceted Filters */}
                                <div className="flex flex-col gap-4">
                                    <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                                        <div className="flex flex-1 items-center gap-2 w-full">
                                            <div className="relative flex-1 max-w-sm">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                                                <Input
                                                    placeholder="Filter bookings..."
                                                    className="pl-9 h-12 bg-white/50 dark:bg-white/5 border-slate-200 dark:border-white/10 rounded-md text-sm focus-visible:ring-1 focus-visible:ring-blue-500/50"
                                                    value={searchTerm}
                                                    onChange={(e) => setSearchTerm(e.target.value)}
                                                />
                                            </div>

                                            <DataTableFacetedFilter
                                                title="Type"
                                                value={typeFilter}
                                                onChange={(v) => updateSearchParam({ type: v })}
                                                options={[
                                                    { label: "Flights", value: "flight", icon: Plane },
                                                    { label: "Hotels", value: "hotel", icon: Building2 },
                                                ]}
                                            />

                                            <DataTableFacetedFilter
                                                title="Status"
                                                value={statusFilter}
                                                onChange={(v) => updateSearchParam({ status: v })}
                                                options={[
                                                    { label: "Confirmed", value: "confirmed" },
                                                    { label: "Ticketed", value: "ticketed" },
                                                    { label: "Pending", value: "pending" },
                                                    { label: "Cancelled", value: "cancelled" },
                                                ]}
                                            />

                                            <DataTableFacetedFilter
                                                title="Supplier"
                                                value={supplierFilter}
                                                onChange={(v) => updateSearchParam({ supplier: v })}
                                                options={[
                                                    { label: "Mystifly", value: "mystifly" },
                                                    { label: "Booking.com", value: "booking.com" },
                                                    { label: "Ratehawk", value: "ratehawk" },
                                                    { label: "Duffel", value: "duffel" },
                                                    { label: "Legacy", value: "legacy" },
                                                ]}
                                            />

                                            <DataTableFacetedFilter
                                                title="Payment"
                                                value={paymentFilter}
                                                onChange={(v) => updateSearchParam({ payment: v })}
                                                options={[
                                                    { label: "Paid", value: "paid" },
                                                    { label: "Unpaid", value: "unpaid" },
                                                    { label: "Partial", value: "partially_paid" },
                                                    { label: "Refunded", value: "refunded" },
                                                ]}
                                            />

                                            {(searchTerm || statusFilter !== 'all' || supplierFilter !== 'all' || paymentFilter !== 'all' || typeFilter !== 'all') && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                        setSearchTerm('');
                                                        updateSearchParam({ q: '', page: 1, status: 'all', supplier: 'all', payment: 'all', type: 'all' });
                                                    }}
                                                    className="h-8 px-2 lg:px-3 text-slate-500 hover:text-rose-500"
                                                >
                                                    Reset
                                                    <XCircle className="ml-2 h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="outline" size="sm" className="ml-auto hidden h-12 lg:flex border-slate-200 dark:border-white/10 rounded-md">
                                                        <Filter className="mr-2 h-4 w-4" />
                                                        View
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-[150px] p-2">
                                                    <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                                                    <DropdownMenuSeparator />
                                                    {COLUMNS.map((column) => (
                                                        <DropdownMenuCheckboxItem
                                                            key={column.id}
                                                            checked={visibleColumns.has(column.id)}
                                                            onCheckedChange={() => toggleColumn(column.id)}
                                                            onSelect={(e) => e.preventDefault()}
                                                            className="rounded-lg"
                                                        >
                                                            {column.label}
                                                        </DropdownMenuCheckboxItem>
                                                    ))}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white dark:bg-obsidian rounded-xl overflow-hidden border border-slate-100 dark:border-white/5 shadow-sm">
                                    <div className="overflow-x-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="hover:bg-transparent">
                                                    {visibleColumns.has('bookingRef') && <TableHead>Ref / PNR</TableHead>}
                                                    {visibleColumns.has('customer') && <TableHead>Customer</TableHead>}
                                                    {visibleColumns.has('ticketId') && <TableHead>Ticket ID</TableHead>}
                                                    {visibleColumns.has('ticketStatus') && <TableHead>Tkt Status</TableHead>}
                                                    {visibleColumns.has('type') && <TableHead>Type</TableHead>}
                                                    {visibleColumns.has('amount') && <TableHead>Amount</TableHead>}
                                                    {visibleColumns.has('status') && <TableHead>Status</TableHead>}
                                                    {visibleColumns.has('payment') && <TableHead>Payment</TableHead>}
                                                    {visibleColumns.has('createdAt') && <TableHead className="text-right pr-6">Created</TableHead>}
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {paginatedBookings.map((booking) => (
                                                    <TableRow key={booking.id} className={cn(
                                                        "group hover:bg-slate-50 dark:hover:bg-white/5 transition-colors border-none cursor-pointer",
                                                        selectedBooking?.id === booking.id && "bg-blue-50/50 dark:bg-blue-500/10"
                                                    )} onClick={() => setSelectedBooking(booking)}>
                                                        {visibleColumns.has('bookingRef') && (
                                                            <TableCell className="font-mono text-xs text-blue-600 dark:text-blue-400">
                                                                <div className="flex flex-col">
                                                                    <span>{booking.bookingRef}</span>
                                                                    {booking.pnr && booking.pnr !== booking.bookingRef && (
                                                                        <span className="text-slate-400 text-[10px] uppercase">PNR: {booking.pnr}</span>
                                                                    )}
                                                                </div>
                                                            </TableCell>
                                                        )}
                                                        {visibleColumns.has('customer') && (
                                                            <TableCell>
                                                                <div className="flex flex-col">
                                                                    <span className="text-sm font-medium text-slate-900 dark:text-white capitalize">{booking.customerName.toLowerCase()}</span>
                                                                    <span className="text-xs text-slate-500 lowercase">{booking.email || 'no email'}</span>
                                                                </div>
                                                            </TableCell>
                                                        )}
                                                        {visibleColumns.has('ticketId') && (
                                                            <TableCell>
                                                                <div className="flex flex-col gap-1">
                                                                    {booking.ticketIds.length > 0 ? (
                                                                        booking.ticketIds.map(t => (
                                                                            <span key={t} className="font-mono text-[10px] text-slate-500 bg-slate-100 dark:bg-white/5 px-1.5 py-0.5 rounded w-fit capitalize">{t}</span>
                                                                        ))
                                                                    ) : (
                                                                        <span className="text-slate-300 text-xs">—</span>
                                                                    )}
                                                                </div>
                                                            </TableCell>
                                                        )}
                                                        {visibleColumns.has('ticketStatus') && (
                                                            <TableCell>
                                                                <span className={`text-xs capitalize px-2 py-0.5 rounded flex items-center w-fit ${booking.ticketStatus === 'Issued' ? 'bg-emerald-500/10 text-emerald-600 font-medium' : 'bg-slate-100 dark:bg-white/5 text-slate-500'}`}>
                                                                    {booking.ticketStatus.toLowerCase()}
                                                                </span>
                                                            </TableCell>
                                                        )}
                                                        {visibleColumns.has('type') && (
                                                            <TableCell>
                                                                <div className="flex flex-col gap-1">
                                                                    <div className="flex items-center gap-1.5 text-sm font-medium text-slate-900 dark:text-white">
                                                                        {booking.type === 'flight' ? <Plane size={12} className="text-slate-400" /> : <Building2 size={12} className="text-slate-400" />}
                                                                        <span className="capitalize">{booking.type}</span>
                                                                    </div>
                                                                    <span className={`text-[10px] capitalize font-semibold ${getSupplierColor(booking.supplier)}`}>
                                                                        {booking.supplier.toLowerCase()}
                                                                    </span>
                                                                </div>
                                                            </TableCell>
                                                        )}
                                                        {visibleColumns.has('amount') && (
                                                            <TableCell>
                                                                <div className="flex flex-col">
                                                                    <span className="text-sm font-medium">{formatCurrency(booking.totalAmount, booking.currency)}</span>
                                                                    {booking.paymentIntentId && (
                                                                        <span className="font-mono text-[10px] text-blue-600 mt-0.5" title={booking.paymentIntentId}>
                                                                            {booking.paymentIntentId.slice(0, 12)}...
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </TableCell>
                                                        )}
                                                        {visibleColumns.has('status') && (
                                                            <TableCell>
                                                                <Badge
                                                                    variant={getStatusVariant(booking.status) as any}
                                                                    className={`w-32 justify-center text-center whitespace-nowrap font-medium text-[10px] px-2 py-0.5 rounded border-none ${booking.status.toLowerCase().includes('confirm') || booking.status.toLowerCase().includes('ticket') ? 'bg-blue-500/10 text-blue-600' :
                                                                        booking.status.toLowerCase().includes('pend') ? 'bg-amber-500/10 text-amber-600' :
                                                                            booking.status.toLowerCase().includes('refund') ? 'bg-violet-500/10 text-violet-600' :
                                                                                'bg-rose-500/10 text-rose-600'
                                                                        }`}
                                                                >
                                                                    {formatStatus(booking.status)}
                                                                </Badge>
                                                            </TableCell>
                                                        )}
                                                        {visibleColumns.has('payment') && (
                                                            <TableCell>
                                                                <Badge
                                                                    variant={getPaymentVariant(booking.paymentStatus) as any}
                                                                    className={`w-32 justify-center text-center whitespace-nowrap font-medium text-[10px] px-2 py-0.5 rounded border-none ${booking.paymentStatus.toLowerCase() === 'paid' ? 'bg-emerald-500/10 text-emerald-600' :
                                                                        booking.paymentStatus.toLowerCase() === 'refunded' ? 'bg-violet-500/10 text-violet-600' :
                                                                            booking.paymentStatus.toLowerCase() === 'cancelled' ? 'bg-slate-500/10 text-slate-600' :
                                                                                booking.paymentStatus.toLowerCase().includes('unpaid') ? 'bg-rose-500/10 text-rose-600' :
                                                                                    'bg-slate-500/10 text-slate-600'
                                                                        }`}
                                                                >
                                                                    {formatStatus(booking.paymentStatus)}
                                                                </Badge>
                                                            </TableCell>
                                                        )}
                                                        {visibleColumns.has('createdAt') && <TableCell className="text-xs text-slate-500 text-right pr-6">{formatDate(booking.createdAt)}</TableCell>}
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>

                                    {(paginatedBookings.length === 0 && !isPending) && (
                                        <div className="py-20 text-center flex flex-col items-center gap-3">
                                            <div className="p-4 bg-slate-100 dark:bg-white/5 rounded-full text-slate-400">
                                                <Search size={24} />
                                            </div>
                                            <p className="text-slate-500 dark:text-slate-400 text-sm">No bookings found with selected filters.</p>
                                            <Button variant="outline" size="sm" onClick={() => {
                                                setSearchTerm('');
                                                updateSearchParam({ q: '', page: 1, status: 'all', supplier: 'all', payment: 'all', type: 'all' });
                                            }}>Clear All Filters</Button>
                                        </div>
                                    )}

                                    {isPending && (
                                        <div className="absolute inset-0 bg-white/20 dark:bg-obsidian/20 backdrop-blur-[1px] flex items-center justify-center z-20 pointer-events-none">
                                            <div className="bg-white/90 dark:bg-obsidian/90 px-4 py-2 rounded-full shadow-lg border border-slate-200 dark:border-white/10 text-blue-600 dark:text-blue-400 text-xs font-normal animate-pulse flex items-center gap-2">
                                                <span className="w-2 h-2 bg-blue-500 rounded-full animate-ping" />
                                                Syncing with server...
                                            </div>
                                        </div>
                                    )}

                                    <div className="px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100 dark:border-white/5">
                                        <p className="text-xs font-normal text-slate-400 order-2 sm:order-1 capitalize">
                                            Total {totalCount} bookings
                                        </p>

                                        <div className="flex items-center gap-2 order-1 sm:order-2">
                                            <Button
                                                variant="outline"
                                                onClick={() => updateSearchParam({ page: Math.max(1, currentPage - 1) })}
                                                disabled={currentPage === 1 || isPending}
                                                className="h-10 px-4 rounded-xl border-slate-200 dark:border-white/10 text-slate-400 hover:text-slate-600 transition-all font-normal text-sm bg-white dark:bg-transparent shadow-sm"
                                            >
                                                Previous
                                            </Button>

                                            <div className="flex items-center gap-1 mx-2">
                                                {(() => {
                                                    const pages = [];
                                                    const maxVisible = 5;
                                                    let start = Math.max(1, currentPage - 2);
                                                    let end = Math.min(totalPages, start + maxVisible - 1);

                                                    if (end - start + 1 < maxVisible) {
                                                        start = Math.max(1, end - maxVisible + 1);
                                                    }

                                                    for (let i = start; i <= end; i++) {
                                                        pages.push(i);
                                                    }

                                                    return pages.map((pageNum) => {
                                                        const isActive = currentPage === pageNum;
                                                        return (
                                                            <button
                                                                key={pageNum}
                                                                onClick={() => updateSearchParam({ page: pageNum })}
                                                                disabled={isPending}
                                                                className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm transition-all ${isActive
                                                                    ? "bg-blue-600 text-white font-normal shadow-md"
                                                                    : "text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5"
                                                                    } ${isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                            >
                                                                {pageNum}
                                                            </button>
                                                        );
                                                    });
                                                })()}
                                            </div>

                                            <Button
                                                variant="outline"
                                                onClick={() => updateSearchParam({ page: Math.min(totalPages, currentPage + 1) })}
                                                disabled={currentPage === totalPages || totalPages === 0 || isPending}
                                                className="h-10 px-4 rounded-xl border-slate-200 dark:border-white/10 text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-all font-normal text-sm bg-white dark:bg-transparent shadow-sm"
                                            >
                                                Next
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="monitoring-view"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            className="space-y-12"
                        >
                            {monitoringLoading && !monitoringData ? (
                                <div className="flex items-center justify-center p-20">
                                    <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                                </div>
                            ) : (
                                <>
                                    {/* Monitoring Header with Sync */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <AlertTriangle className="text-amber-500 w-5 h-5" />
                                            <h2 className="text-lg font-black text-slate-900 dark:text-white">Payment Mismatches</h2>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={fetchMonitoringData}
                                            disabled={monitoringLoading}
                                            className="gap-2 text-xs font-bold text-blue-600"
                                        >
                                            <RefreshCw size={14} className={monitoringLoading ? "animate-spin" : ""} />
                                            Sync Status
                                        </Button>
                                    </div>

                                    {/* Mismatches Table */}
                                    <div className="bg-white dark:bg-obsidian rounded-xl overflow-hidden border border-slate-100 dark:border-white/5 shadow-sm">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="hover:bg-transparent">
                                                    <TableHead>Session ID</TableHead>
                                                    <TableHead>Customer</TableHead>
                                                    <TableHead>Payment ID</TableHead>
                                                    <TableHead>Created</TableHead>
                                                    <TableHead className="text-right">Action</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {monitoringData?.mismatches.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={5} className="py-12 text-center text-slate-400 italic">
                                                            No payment mismatches detected. Healthy state.
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    monitoringData?.mismatches.map((m) => (
                                                        <TableRow key={m.id} className="hover:bg-slate-50 dark:hover:bg-white/5 border-none">
                                                            <TableCell className="font-mono text-xs">{m.id.slice(0, 8)}...</TableCell>
                                                            <TableCell className="text-sm font-medium">{m.customer}</TableCell>
                                                            <TableCell className="font-mono text-[10px] text-blue-600">
                                                                <div className="flex items-center gap-1">
                                                                    {m.payment_intent_id.slice(0, 12)}...
                                                                    <a href={`https://dashboard.stripe.com/payments/${m.payment_intent_id}`} target="_blank" className="hover:text-blue-700">
                                                                        <ExternalLink size={10} />
                                                                    </a>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="text-xs text-slate-500">{formatDate(m.created_at)}</TableCell>
                                                            <TableCell className="text-right">
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => handleRetry(m.id)}
                                                                    disabled={isPending}
                                                                    className="rounded-lg bg-blue-600 hover:bg-blue-700 h-8 gap-2 px-4 shadow-md font-bold text-[10px] uppercase tracking-wider text-white"
                                                                >
                                                                    {isPending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                                                                    Retry Booking
                                                                </Button>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>

                                    {/* Awaiting Tickets Queue */}
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Clock className="text-amber-500 w-5 h-5 flex-shrink-0" />
                                                <h2 className="text-lg font-black text-slate-900 dark:text-white">Mystifly Async Queue (Awaiting Tickets)</h2>
                                            </div>
                                            {monitoringData?.stats.awaitingCount ? (
                                                <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 font-bold text-xs uppercase px-2 py-1 rounded-md">
                                                    {monitoringData.stats.awaitingCount} Queue{monitoringData.stats.awaitingCount > 1 ? 's' : ''}
                                                </span>
                                            ) : null}
                                        </div>
                                        <div className="bg-white dark:bg-obsidian rounded-xl overflow-hidden border border-slate-100 dark:border-white/5 shadow-sm">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow className="hover:bg-transparent">
                                                        <TableHead>Booking ID</TableHead>
                                                        <TableHead>Customer</TableHead>
                                                        <TableHead>Amount</TableHead>
                                                        <TableHead>Time Limit</TableHead>
                                                        <TableHead className="text-right">Action</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {!monitoringData?.awaitingTickets || monitoringData?.awaitingTickets.length === 0 ? (
                                                        <TableRow>
                                                            <TableCell colSpan={5} className="py-12 text-center text-slate-400 italic">
                                                                No bookings waiting for tickets. Good!
                                                            </TableCell>
                                                        </TableRow>
                                                    ) : (
                                                        monitoringData?.awaitingTickets.map((b) => (
                                                            <TableRow key={b.id} className="hover:bg-slate-50 dark:hover:bg-white/5 border-none">
                                                                <TableCell className="font-mono text-xs">{b.id.slice(0, 8)}...</TableCell>
                                                                <TableCell className="text-sm font-medium">{b.customerName}</TableCell>
                                                                <TableCell className="text-xs font-bold">{formatCurrency(b.total_price, b.currency)}</TableCell>
                                                                <TableCell className="text-xs">
                                                                    <Countdown targetDate={b.ticket_time_limit} />
                                                                </TableCell>
                                                                <TableCell className="text-right">
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        onClick={() => handleCancelAwaiting(b.id)}
                                                                        disabled={isPending}
                                                                        className="rounded-lg h-8 px-4 text-[10px] uppercase font-bold text-amber-600 border-amber-200 hover:bg-amber-50"
                                                                    >
                                                                        {isPending ? <Loader2 size={12} className="animate-spin mr-2" /> : null}
                                                                        Cancel before expiry
                                                                    </Button>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </div>

                                    {/* Failed Bookings Table */}
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2">
                                            <ShieldAlert className="text-rose-500 w-5 h-5" />
                                            <h2 className="text-lg font-black text-slate-900 dark:text-white">Recent Failed Records</h2>
                                        </div>
                                        <div className="bg-white dark:bg-obsidian rounded-xl overflow-hidden border border-slate-100 dark:border-white/5 shadow-sm">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow className="hover:bg-transparent">
                                                        <TableHead>ID</TableHead>
                                                        <TableHead>Provider</TableHead>
                                                        <TableHead>Amount</TableHead>
                                                        <TableHead>Time</TableHead>
                                                        <TableHead>Type</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {monitoringData?.failedBookings.length === 0 ? (
                                                        <TableRow>
                                                            <TableCell colSpan={5} className="py-12 text-center text-slate-400 italic">
                                                                No failed bookings recorded.
                                                            </TableCell>
                                                        </TableRow>
                                                    ) : (
                                                        monitoringData?.failedBookings.map((b: any) => (
                                                            <TableRow key={b.id} className="hover:bg-slate-50 dark:hover:bg-white/5 border-none">
                                                                <TableCell className="font-mono text-xs text-rose-600 font-bold">{b.id.slice(0, 8).toUpperCase()}</TableCell>
                                                                <TableCell className="text-xs">{formatStatus(b.provider)}</TableCell>
                                                                <TableCell className="text-sm font-bold">{formatCurrency(b.total_price || b.total_amount, b.currency || 'USD')}</TableCell>
                                                                <TableCell className="text-xs text-slate-500">{formatDate(b.created_at)}</TableCell>
                                                                <TableCell className="text-xs font-bold">{formatStatus(b.type)}</TableCell>
                                                            </TableRow>
                                                        ))
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>

                <BookingDetailsDialog
                    booking={selectedBooking}
                    onClose={() => setSelectedBooking(null)}
                />
            </div>
        </div>
    );
}
