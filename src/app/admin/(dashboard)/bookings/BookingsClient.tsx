"use client";

import React, { useState, useMemo } from 'react';
import { HeaderTitle } from '@/components/admin/HeaderTitle';
import {
    Search,
    Filter,
    MoreHorizontal,
    Download,
    Plane,
    Building2
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
import { formatCurrency, formatDate } from '@/lib/utils';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Booking } from '@/types/admin';
import { PaginatedBookings } from '@/lib/server/adminActions';
import { BookingDetailsDialog } from './BookingDetailsDialog';

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

export function BookingsClient({ data, searchParams }: BookingsClientProps) {
    const router = useRouter();
    const pathname = usePathname();
    const currentSearchParams = useSearchParams();
    const [isPending, startTransition] = React.useTransition();

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

    const [showFilters, setShowFilters] = useState(
        statusFilter !== 'all' ||
        supplierFilter !== 'all' ||
        paymentFilter !== 'all' ||
        typeFilter !== 'all'
    );
    const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);

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
            <HeaderTitle
                title="Bookings"
                subtitle="Platform bookings and supplier tracking"
                actions={
                    <div className="flex items-center gap-3">
                        <Button variant="outline" className="rounded-2xl border-slate-200 dark:border-white/10 dark:bg-white/5 font-normal h-12 px-6 hover:bg-slate-50 transition-all gap-2">
                            <Download size={18} />
                            Export
                        </Button>
                    </div>
                }
            />

            <div className="space-y-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="p-6 bg-white dark:bg-obsidian rounded-none shadow-xl overflow-hidden border border-slate-200/50 dark:border-white/5"
                >
                    {/* Search and Quick Filters */}
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col sm:flex-row gap-4 items-center">
                            <div className="relative flex-1 w-full">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                                <Input
                                    placeholder="Search PNR, Name, Email, Payment ID or Ticket..."
                                    className="pl-10 bg-white/50 dark:bg-white/5 border-white/20 dark:border-white/10"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <div className="flex items-center gap-2 w-full sm:w-auto">
                                <Button
                                    variant={showFilters ? "secondary" : "ghost"}
                                    size="sm"
                                    onClick={() => setShowFilters(!showFilters)}
                                    className="flex-1 sm:flex-none text-slate-600 dark:text-slate-400"
                                >
                                    <Filter size={16} className="mr-2" />
                                    {showFilters ? "Hide" : "Filter"}
                                </Button>

                                {(searchTerm || statusFilter !== 'all' || supplierFilter !== 'all' || paymentFilter !== 'all' || typeFilter !== 'all') && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setSearchTerm('');
                                            updateSearchParam({ q: '', page: 1, status: 'all', supplier: 'all', payment: 'all', type: 'all' });
                                        }}
                                        className="text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                                    >
                                        Reset
                                    </Button>
                                )}

                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-[200px] bg-white dark:bg-obsidian border-slate-200 dark:border-white/10 shadow-2xl rounded-xl p-2">
                                        <DropdownMenuLabel className="text-xs font-normal uppercase tracking-widest text-slate-400 px-2 py-1.5">Toggle Columns</DropdownMenuLabel>
                                        <DropdownMenuSeparator className="bg-slate-100 dark:bg-white/5" />
                                        {COLUMNS.map((column) => (
                                            <DropdownMenuCheckboxItem
                                                key={column.id}
                                                className="text-xs font-normal text-slate-600 dark:text-slate-300 focus:bg-slate-50 dark:focus:bg-white/5 rounded-lg py-2"
                                                checked={visibleColumns.has(column.id)}
                                                onCheckedChange={() => toggleColumn(column.id)}
                                                onSelect={(e) => e.preventDefault()}
                                            >
                                                {column.label}
                                            </DropdownMenuCheckboxItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>

                        <AnimatePresence>
                            {showFilters && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 pt-2 pb-2">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-normal uppercase tracking-wider text-slate-400">Type</label>
                                            <select
                                                value={typeFilter}
                                                onChange={(e) => updateSearchParam({ type: e.target.value })}
                                                className="w-full bg-white/50 dark:bg-white/5 border border-white/20 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-blue-500/50 transition-colors"
                                            >
                                                <option value="all">All Types</option>
                                                <option value="flight">Flights</option>
                                                <option value="hotel">Hotels</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-normal uppercase tracking-wider text-slate-400">Status</label>
                                            <select
                                                value={statusFilter}
                                                onChange={(e) => updateSearchParam({ status: e.target.value })}
                                                className="w-full bg-white/50 dark:bg-white/5 border border-white/20 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-blue-500/50 transition-colors"
                                            >
                                                <option value="all">All Statuses</option>
                                                <option value="confirmed">Confirmed</option>
                                                <option value="ticketed">Ticketed</option>
                                                <option value="pending">Pending</option>
                                                <option value="cancelled">Cancelled</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-normal uppercase tracking-wider text-slate-400">Supplier</label>
                                            <select
                                                value={supplierFilter}
                                                onChange={(e) => updateSearchParam({ supplier: e.target.value })}
                                                className="w-full bg-white/50 dark:bg-white/5 border border-white/20 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-blue-500/50 transition-colors"
                                            >
                                                <option value="all">All Suppliers</option>
                                                <option value="mystifly">Mystifly</option>
                                                <option value="booking.com">Booking.com</option>
                                                <option value="ratehawk">Ratehawk</option>
                                                <option value="duffel">Duffel</option>
                                                <option value="legacy">Legacy</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-normal uppercase tracking-wider text-slate-400">Payment</label>
                                            <select
                                                value={paymentFilter}
                                                onChange={(e) => updateSearchParam({ payment: e.target.value })}
                                                className="w-full bg-white/50 dark:bg-white/5 border border-white/20 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-blue-500/50 transition-colors"
                                            >
                                                <option value="all">Any Payment</option>
                                                <option value="paid">Paid</option>
                                                <option value="unpaid">Unpaid</option>
                                                <option value="partially_paid">Partial</option>
                                                <option value="refunded">Refunded</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-normal uppercase tracking-wider text-slate-400">Date Range</label>
                                            <select className="w-full bg-white/50 dark:bg-white/5 border border-white/20 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-blue-500/50 transition-colors">
                                                <option>All Time</option>
                                                <option>Today</option>
                                                <option>Last 7 Days</option>
                                                <option>Last 30 Days</option>
                                            </select>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                    className="bg-white dark:bg-obsidian rounded-none shadow-xl border border-slate-200/50 dark:border-white/5 relative"
                >
                    <div className="p-6">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-transparent hover:bg-transparent border-none">
                                        {visibleColumns.has('bookingRef') && <TableHead className="py-4 text-sm font-normal uppercase tracking-widest text-slate-400">Ref / PNR</TableHead>}
                                        {visibleColumns.has('customer') && <TableHead className="py-4 text-sm font-normal uppercase tracking-widest text-slate-400">Customer</TableHead>}
                                        {visibleColumns.has('ticketId') && <TableHead className="py-4 text-sm font-normal uppercase tracking-widest text-slate-400">Ticket ID</TableHead>}
                                        {visibleColumns.has('ticketStatus') && <TableHead className="py-4 text-sm font-normal uppercase tracking-widest text-slate-400">Tkt Status</TableHead>}
                                        {visibleColumns.has('type') && <TableHead className="py-4 text-sm font-normal uppercase tracking-widest text-slate-400">Type</TableHead>}
                                        {visibleColumns.has('amount') && <TableHead className="py-4 text-sm font-normal uppercase tracking-widest text-slate-400">Amount</TableHead>}
                                        {visibleColumns.has('status') && <TableHead className="py-4 text-sm font-normal uppercase tracking-widest text-slate-400">Status</TableHead>}
                                        {visibleColumns.has('payment') && <TableHead className="py-4 text-sm font-normal uppercase tracking-widest text-slate-400">Payment</TableHead>}
                                        {visibleColumns.has('createdAt') && <TableHead className="py-4 text-sm font-normal uppercase tracking-widest text-slate-400 text-right pr-6">Created</TableHead>}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginatedBookings.map((booking) => (
                                        <TableRow key={booking.id} className="group hover:bg-slate-50 dark:hover:bg-white/5 transition-colors border-none cursor-pointer" onClick={() => { setSelectedBooking(booking); setDialogOpen(true); }}>
                                            {visibleColumns.has('bookingRef') && (
                                                <TableCell className="py-5 font-mono font-normal text-xs text-blue-600 dark:text-blue-400">
                                                    <div className="flex flex-col">
                                                        <span>{booking.bookingRef}</span>
                                                        {booking.pnr && booking.pnr !== booking.bookingRef && (
                                                            <span className="text-slate-400 text-xs uppercase tracking-tighter">PNR: {booking.pnr}</span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            )}
                                            {visibleColumns.has('customer') && (
                                                <TableCell className="py-5">
                                                    <div className="flex flex-col">
                                                        <span className="font-normal text-slate-900 dark:text-white uppercase tracking-tight text-sm">{booking.customerName}</span>
                                                        <span className="text-xs font-normal text-slate-400 lowercase leading-tight">{booking.email || 'no email'}</span>
                                                    </div>
                                                </TableCell>
                                            )}
                                            {visibleColumns.has('ticketId') && (
                                                <TableCell className="py-5">
                                                    <div className="flex flex-col gap-1">
                                                        {booking.ticketIds.length > 0 ? (
                                                            booking.ticketIds.map(t => (
                                                                <span key={t} className="font-mono text-xs text-slate-500 font-normal bg-slate-100 dark:bg-white/5 px-1.5 py-0.5 rounded w-fit capitalize">{t}</span>
                                                            ))
                                                        ) : (
                                                            <span className="text-slate-300 text-xs">—</span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            )}
                                            {visibleColumns.has('ticketStatus') && (
                                                <TableCell className="py-5">
                                                    <span className={`text-xs font-normal uppercase px-2 py-0.5 rounded flex items-center w-fit ${booking.ticketStatus === 'Issued' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-100 dark:bg-white/5 text-slate-400'}`}>
                                                        {booking.ticketStatus}
                                                    </span>
                                                </TableCell>
                                            )}
                                            {visibleColumns.has('type') && (
                                                <TableCell className="py-5">
                                                    <div className="flex flex-col gap-1">
                                                        <div className="flex items-center gap-1.5 text-sm text-slate-500 font-normal">
                                                            {booking.type === 'flight' ? <Plane size={12} /> : <Building2 size={12} />}
                                                            <span className="capitalize">{booking.type}</span>
                                                        </div>
                                                        <span className={`text-xs font-normal uppercase tracking-tight ${getSupplierColor(booking.supplier)}`}>
                                                            {booking.supplier}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                            )}
                                            {visibleColumns.has('amount') && (
                                                <TableCell className="py-5 font-normal text-slate-900 dark:text-white">
                                                    <div className="flex flex-col">
                                                        <span>{formatCurrency(booking.totalAmount, booking.currency)}</span>
                                                        {booking.paymentIntentId && (
                                                            <span className="text-xs text-slate-400 font-mono" title={booking.paymentIntentId}>
                                                                ID: {booking.paymentIntentId.slice(0, 10)}...
                                                            </span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            )}
                                            {visibleColumns.has('status') && (
                                                <TableCell className="py-5">
                                                    <Badge
                                                        variant={getStatusVariant(booking.status) as any}
                                                        className={`font-normal uppercase text-xs px-3 py-1 rounded-lg border-none ${booking.status.toLowerCase().includes('confirm') || booking.status.toLowerCase().includes('ticket') ? 'bg-blue-500/10 text-blue-600' :
                                                            booking.status.toLowerCase().includes('pend') ? 'bg-amber-500/10 text-amber-600' :
                                                                'bg-rose-500/10 text-rose-600'
                                                            }`}
                                                    >
                                                        {booking.status}
                                                    </Badge>
                                                </TableCell>
                                            )}
                                            {visibleColumns.has('payment') && (
                                                <TableCell className="py-5">
                                                    <Badge
                                                        variant={getPaymentVariant(booking.paymentStatus) as any}
                                                        className={`font-normal uppercase text-xs px-3 py-1 rounded-lg border-none ${booking.paymentStatus.toLowerCase() === 'paid' ? 'bg-emerald-500/10 text-emerald-600' :
                                                            booking.paymentStatus.toLowerCase().includes('unpaid') ? 'bg-rose-500/10 text-rose-600' :
                                                                'bg-slate-500/10 text-slate-600'
                                                            }`}
                                                    >
                                                        {booking.paymentStatus.replace('_', ' ')}
                                                    </Badge>
                                                </TableCell>
                                            )}
                                            {visibleColumns.has('createdAt') && <TableCell className="py-5 text-xs text-slate-400 font-normal text-right pr-6">{formatDate(booking.createdAt)}</TableCell>}
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
                    </div>

                    {isPending && (
                        <div className="absolute inset-0 bg-white/20 dark:bg-obsidian/20 backdrop-blur-[1px] flex items-center justify-center z-20 pointer-events-none">
                            <div className="bg-white/90 dark:bg-obsidian/90 px-4 py-2 rounded-full shadow-lg border border-slate-200 dark:border-white/10 text-blue-600 dark:text-blue-400 text-xs font-normal animate-pulse flex items-center gap-2">
                                <span className="w-2 h-2 bg-blue-500 rounded-full animate-ping" />
                                Syncing with server...
                            </div>
                        </div>
                    )}

                    <div className="px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100 dark:border-white/5">
                        <p className="text-xs font-normal uppercase tracking-wider text-slate-400 order-2 sm:order-1">
                            Total {totalCount} Bookings
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
                </motion.div>
            </div>

            <BookingDetailsDialog
                booking={selectedBooking}
                open={dialogOpen}
                onOpenChange={setDialogOpen}
            />
        </div>
    );
}
