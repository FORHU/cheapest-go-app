"use client";

import React, { useState, useMemo } from 'react';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { CalendarCheck, Search, Filter, MoreHorizontal, Eye, Download, Plane, Building2, ChevronDown } from 'lucide-react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Badge,
    Button,
    Input
} from '@/components/ui';
import { motion, AnimatePresence } from 'framer-motion';
import { formatCurrency, formatDate } from '@/lib/utils';

type Booking = {
    id: string;
    bookingRef: string;
    type: "flight" | "hotel";
    supplier: "mystifly" | "booking.com" | "ratehawk" | "duffel";
    customerName: string;
    totalAmount: number;
    currency: string;
    status: "confirmed" | "pending" | "cancelled";
    paymentStatus: "paid" | "unpaid" | "partially_paid" | "refunded";
    createdAt: string;
};

const mockBookings: Booking[] = [
    { id: '1', bookingRef: 'FL-2024-001', type: 'flight', supplier: 'mystifly', customerName: 'Sarah Jenkins', totalAmount: 450.00, currency: 'USD', status: 'confirmed', paymentStatus: 'paid', createdAt: '2024-03-01T10:00:00Z' },
    { id: '2', bookingRef: 'HT-2024-002', type: 'hotel', supplier: 'booking.com', customerName: 'Michael Chen', totalAmount: 850.50, currency: 'USD', status: 'pending', paymentStatus: 'unpaid', createdAt: '2024-03-02T14:30:00Z' },
    { id: '3', bookingRef: 'FL-2024-003', type: 'flight', supplier: 'duffel', customerName: 'Emily Davis', totalAmount: 120.00, currency: 'USD', status: 'cancelled', paymentStatus: 'refunded', createdAt: '2024-02-28T09:15:00Z' },
    { id: '4', bookingRef: 'HT-2024-004', type: 'hotel', supplier: 'ratehawk', customerName: 'James Wilson', totalAmount: 520.00, currency: 'USD', status: 'confirmed', paymentStatus: 'paid', createdAt: '2024-03-03T11:45:00Z' },
    { id: '5', bookingRef: 'FL-2024-005', type: 'flight', supplier: 'mystifly', customerName: 'Robert Brown', totalAmount: 1250.00, currency: 'USD', status: 'confirmed', paymentStatus: 'partially_paid', createdAt: '2024-03-04T16:20:00Z' },
    { id: '6', bookingRef: 'HT-2024-006', type: 'hotel', supplier: 'booking.com', customerName: 'Lisa Wang', totalAmount: 320.00, currency: 'USD', status: 'confirmed', paymentStatus: 'paid', createdAt: '2024-03-05T08:10:00Z' },
];

export default function AdminBookingsPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [supplierFilter, setSupplierFilter] = useState<string>('all');
    const [paymentFilter, setPaymentFilter] = useState<string>('all');
    const [showFilters, setShowFilters] = useState(false);

    const filteredBookings = useMemo(() => {
        return mockBookings.filter(booking => {
            const matchesSearch =
                booking.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                booking.bookingRef.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesStatus = statusFilter === 'all' || booking.status === statusFilter;
            const matchesSupplier = supplierFilter === 'all' || booking.supplier === supplierFilter;
            const matchesPayment = paymentFilter === 'all' || booking.paymentStatus === paymentFilter;

            return matchesSearch && matchesStatus && matchesSupplier && matchesPayment;
        });
    }, [searchTerm, statusFilter, supplierFilter, paymentFilter]);

    const getStatusVariant = (status: Booking['status']) => {
        switch (status) {
            case 'confirmed': return 'default';
            case 'pending': return 'secondary';
            case 'cancelled': return 'destructive';
            default: return 'outline';
        }
    };

    const getPaymentVariant = (status: Booking['paymentStatus']) => {
        switch (status) {
            case 'paid': return 'default';
            case 'partially_paid': return 'secondary';
            case 'unpaid': return 'destructive';
            case 'refunded': return 'outline';
            default: return 'ghost';
        }
    };

    const getSupplierColor = (supplier: Booking['supplier']) => {
        switch (supplier) {
            case 'mystifly': return 'text-blue-500';
            case 'booking.com': return 'text-blue-600';
            case 'ratehawk': return 'text-blue-400';
            case 'duffel': return 'text-blue-600';
            default: return 'text-slate-500';
        }
    };

    return (
        <div className="space-y-6 sm:space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <SectionHeader
                    title="Bookings Management"
                    subtitle="Universal platform bookings and supplier tracking."
                    size="lg"
                    icon={CalendarCheck}
                />
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="gap-2">
                        <Download size={16} />
                        Export
                    </Button>
                    <Button size="sm">New Booking</Button>
                </div>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/50 dark:bg-obsidian/50 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden"
            >
                {/* Search and Quick Filters */}
                <div className="p-4 border-b border-slate-200 dark:border-white/5 flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row gap-4 items-center">
                        <div className="relative flex-1 w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                            <Input
                                placeholder="Search by name, ref..."
                                className="pl-10 bg-white/50 dark:bg-white/5 border-white/20 dark:border-white/10"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <Button
                            variant={showFilters ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => setShowFilters(!showFilters)}
                            className="w-full sm:w-auto text-slate-600 dark:text-slate-400"
                        >
                            <Filter size={16} className="mr-2" />
                            {showFilters ? "Hide Filters" : "Show Filters"}
                        </Button>
                    </div>

                    <AnimatePresence>
                        {showFilters && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-2 pb-2">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</label>
                                        <select
                                            value={statusFilter}
                                            onChange={(e) => setStatusFilter(e.target.value)}
                                            className="w-full bg-white/50 dark:bg-white/5 border border-white/20 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-blue-500/50 transition-colors"
                                        >
                                            <option value="all">All Statuses</option>
                                            <option value="confirmed">Confirmed</option>
                                            <option value="pending">Pending</option>
                                            <option value="cancelled">Cancelled</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Supplier</label>
                                        <select
                                            value={supplierFilter}
                                            onChange={(e) => setSupplierFilter(e.target.value)}
                                            className="w-full bg-white/50 dark:bg-white/5 border border-white/20 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-blue-500/50 transition-colors"
                                        >
                                            <option value="all">All Suppliers</option>
                                            <option value="mystifly">Mystifly</option>
                                            <option value="booking.com">Booking.com</option>
                                            <option value="ratehawk">Ratehawk</option>
                                            <option value="duffel">Duffel</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Payment</label>
                                        <select
                                            value={paymentFilter}
                                            onChange={(e) => setPaymentFilter(e.target.value)}
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
                                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Date Range</label>
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

                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Ref</TableHead>
                                <TableHead>Customer</TableHead>
                                <TableHead>Supplier</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Amount</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Payment</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredBookings.map((booking) => (
                                <TableRow key={booking.id}>
                                    <TableCell className="font-mono font-bold text-[10px] text-blue-600 dark:text-blue-400">{booking.bookingRef}</TableCell>
                                    <TableCell className="font-medium text-slate-900 dark:text-white">{booking.customerName}</TableCell>
                                    <TableCell>
                                        <span className={`text-[10px] font-bold uppercase tracking-tight ${getSupplierColor(booking.supplier)}`}>
                                            {booking.supplier}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                            {booking.type === 'flight' ? <Plane size={12} /> : <Building2 size={12} />}
                                            <span className="capitalize">{booking.type}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-bold">{formatCurrency(booking.totalAmount, booking.currency)}</TableCell>
                                    <TableCell>
                                        <Badge variant={getStatusVariant(booking.status) as any} className="capitalize text-[10px]">
                                            {booking.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={getPaymentVariant(booking.paymentStatus) as any} className="capitalize text-[10px]">
                                            {booking.paymentStatus.replace('_', ' ')}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-[10px] text-slate-400">{formatDate(booking.createdAt)}</TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400">
                                            <MoreHorizontal size={14} />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                {filteredBookings.length === 0 && (
                    <div className="py-20 text-center flex flex-col items-center gap-3">
                        <div className="p-4 bg-slate-100 dark:bg-white/5 rounded-full text-slate-400">
                            <Search size={24} />
                        </div>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">No bookings found with selected filters.</p>
                        <Button variant="outline" size="sm" onClick={() => {
                            setSearchTerm('');
                            setStatusFilter('all');
                            setSupplierFilter('all');
                            setPaymentFilter('all');
                        }}>Clear All Filters</Button>
                    </div>
                )}

                <div className="p-4 border-t border-slate-200 dark:border-white/5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <p>Total: {filteredBookings.length} Bookings</p>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" disabled className="h-6 px-2 text-[10px]">Prev</Button>
                        <Button variant="ghost" size="sm" disabled className="h-6 px-2 text-[10px]">Next</Button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
