"use client";
import React, { useState, useTransition, useMemo } from 'react';
import { HeaderTitle } from '@/components/admin/HeaderTitle';
import {
    Search, SlidersHorizontal, ArrowUpDown, ChevronDown, CheckCircle2,
    XCircle, Filter, Download, LayoutDashboard, ArrowUpRight,
    Loader2, AlertTriangle, RefreshCw, ExternalLink,
    Plane, Building2, TrendingUp, DollarSign, Percent, Briefcase, Layers
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
import { motion, AnimatePresence } from 'framer-motion';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { PaginatedBookings } from '@/lib/server/admin';
import { Booking } from '@/types/admin';
import { toast } from 'sonner';
import { DataTableFacetedFilter } from '../bookings/DataTableFacetedFilter';
import { useUserCurrency } from '@/stores/searchStore';
import { convertCurrency } from '@/lib/currency';

interface RevenueBooking extends Booking {
    stripeFee: number;
    stripeFeeProcessing: number;
    stripeFeeFixed: number;
    netProfit: number;
    markupPercentage: number;
    markupPlatform: number;
    markupMargin: number;
}

interface RevenueClientProps {
    data: {
        bookings: RevenueBooking[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    };
    searchParams: {
        page: number;
        q: string;
        status: string;
        supplier: string;
        type: string;
    };
    defaultCurrency?: string;
}

const StatCard = ({ title, value, icon: Icon, trend, color, subtitle }: any) => (
    <div className="bg-white dark:bg-obsidian rounded-2xl p-6 border border-slate-100 dark:border-white/5 shadow-sm hover:shadow-md transition-all group overflow-hidden relative">
        <div className={`absolute top-0 right-0 w-24 h-24 ${color} opacity-5 blur-3xl rounded-full -mr-12 -mt-12 group-hover:opacity-10 transition-opacity`} />
        <div className="flex items-center justify-between mb-4">
            <div className={`p-3 rounded-xl ${color} bg-opacity-10 text-opacity-100 shrink-0`}>
                <Icon size={20} className={color.replace('bg-', 'text-')} />
            </div>
            {trend && (
                <div className="flex items-center gap-1 text-emerald-500 font-bold text-xs">
                    <TrendingUp size={12} />
                    {trend}
                </div>
            )}
        </div>
        <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{title}</p>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{value}</h3>
            {subtitle && <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mt-1">{subtitle}</p>}
        </div>
    </div>
);

export function RevenueClient({ data, searchParams, defaultCurrency }: RevenueClientProps) {
    const router = useRouter();
    const pathname = usePathname();
    const currentSearchParams = useSearchParams();
    const userCurrency = useUserCurrency();
    const activeCurrency = defaultCurrency || userCurrency || 'PHP';
    const [isPending, startTransition] = React.useTransition();
    const [searchTerm, setSearchTerm] = useState(searchParams.q);

    const initialBookings = data.bookings;
    const totalPages = data.totalPages;
    const currentPage = data.page;
    const totalCount = data.total;

    const statusFilter = searchParams.status;
    const supplierFilter = searchParams.supplier;
    const typeFilter = searchParams.type;

    // Financial Analysis
    const stats = useMemo(() => {
        const bookings = initialBookings;
        const totalRevenue = bookings.reduce((sum, b) => sum + b.totalAmount, 0);
        const totalProfitAfterFees = bookings.reduce((sum, b) => sum + b.netProfit, 0);
        const totalStripeFees = bookings.reduce((sum, b) => sum + b.stripeFee, 0);
        const totalCost = bookings.reduce((sum, b) => sum + (b.supplierCost || (b.totalAmount - b.profit)), 0);
        const avgMarkup = totalCost > 0 ? (bookings.reduce((sum, b) => sum + b.markupAmount, 0) / totalCost) * 100 : 0;

        return {
            totalRevenue,
            totalProfitAfterFees,
            totalStripeFees,
            avgMarkup,
            bookingCount: bookings.length
        };
    }, [initialBookings]);

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

    const handleExport = () => {
        try {
            const headers = ['Ref', 'Type', 'Supplier', 'Customer', 'Selling Price', 'Supplier Cost', 'Markup Amount', 'Markup %', 'Stripe Fees', 'Net Profit', 'Currency', 'Date'];
            const rows = initialBookings.map((b: RevenueBooking) => {
                return [
                    b.bookingRef,
                    b.type,
                    b.supplier,
                    b.customerName,
                    b.totalAmount,
                    b.supplierCost,
                    b.markupAmount,
                    b.markupPercentage + '%',
                    b.stripeFee,
                    b.netProfit,
                    b.currency,
                    formatDate(b.createdAt)
                ];
            });

            const csvContent = [
                headers.join(','),
                ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            ].join('\n');

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `revenue-export-${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast.success('Revenue report exported');
        } catch (error) {
            toast.error('Export failed');
        }
    };

    return (
        <div className="space-y-10 pb-20">
            <HeaderTitle
                actions={
                    <Button
                        variant="outline"
                        className="rounded-xl border-slate-200 dark:border-white/10 dark:bg-white/5 font-normal h-12 px-6 hover:bg-slate-50 transition-all gap-2"
                        onClick={handleExport}
                    >
                        <Download size={18} />
                        Export Report
                    </Button>
                }
            />

            {/* Financial Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Total Revenue"
                    value={formatCurrency(convertCurrency(stats.totalRevenue, 'PHP', activeCurrency), activeCurrency)}
                    icon={DollarSign}
                    color="bg-blue-500"
                    subtitle="Gross Bookings Value"
                />
                <StatCard
                    title="Net Profit"
                    value={formatCurrency(convertCurrency(stats.totalProfitAfterFees, 'PHP', activeCurrency), activeCurrency)}
                    icon={TrendingUp}
                    color={stats.totalProfitAfterFees >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}
                    trend={`${((stats.totalProfitAfterFees / (stats.totalRevenue || 1)) * 100).toFixed(1)}% margin`}
                    subtitle={stats.totalProfitAfterFees >= 0 ? "After Stripe Fees" : "Net Loss detected"}
                />
                <StatCard
                    title="Stripe Fees"
                    value={formatCurrency(convertCurrency(stats.totalStripeFees, 'PHP', activeCurrency), activeCurrency)}
                    icon={DollarSign}
                    color="bg-rose-500"
                    subtitle="Processing Costs"
                />
                <StatCard
                    title="Avg. Markup %"
                    value={`${stats.avgMarkup.toFixed(2)}%`}
                    icon={Percent}
                    color="bg-violet-500"
                    subtitle="Gross Margin"
                />
            </div>

            <div className="space-y-6">
                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                    <div className="flex flex-1 items-center gap-2 w-full max-w-2xl">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                            <Input
                                placeholder="Search revenue items..."
                                className="pl-9 h-12 bg-white/50 dark:bg-white/5 border-slate-200 dark:border-white/10 rounded-xl text-sm focus-visible:ring-1 focus-visible:ring-blue-500/50"
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
                                { label: "Bundles", value: "bundle", icon: Layers },
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

                        {(searchTerm || statusFilter !== 'all' || supplierFilter !== 'all' || typeFilter !== 'all') && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setSearchTerm('');
                                    updateSearchParam({ q: '', page: 1, status: 'all', supplier: 'all', type: 'all' });
                                }}
                                className="h-8 px-2 lg:px-3 text-slate-500 hover:text-rose-500"
                            >
                                Reset
                                <XCircle className="ml-2 h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>

                {/* Revenue Table */}
                <div className="bg-white dark:bg-obsidian rounded-2xl overflow-hidden border border-slate-100 dark:border-white/5 shadow-sm">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent border-slate-100 dark:border-white/5">
                                    <TableHead className="pl-6 w-32">Reference</TableHead>
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Financial Breakdown</TableHead>
                                    <TableHead>Markup</TableHead>
                                    <TableHead>Net Profit</TableHead>
                                    <TableHead className="text-right pr-6">Booking Date</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {initialBookings.map((booking) => {
                                    return (
                                        <TableRow key={booking.id} className="group hover:bg-slate-50 dark:hover:bg-white/5 transition-colors border-slate-100 dark:border-white/5">
                                            <TableCell className="pl-6">
                                                <div className="flex flex-col">
                                                    <span className="font-black text-blue-600 dark:text-blue-400 text-xs tracking-tighter uppercase">{booking.bookingRef}</span>
                                                    <div className="flex items-center gap-1 mt-1">
                                                        {booking.type === 'flight' ? <Plane size={10} className="text-slate-400" /> :
                                                            (booking.type === 'bundle' || booking.type === 'hotel_bundle') ? <Layers size={10} className="text-violet-400" /> :
                                                                <Building2 size={10} className="text-slate-400" />}
                                                        <span className="text-[10px] text-slate-400 font-bold uppercase">{booking.supplier}</span>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold text-slate-900 dark:text-white capitalize">{booking.customerName.toLowerCase()}</span>
                                                    <span className="text-[10px] text-slate-500 font-medium">{booking.email || 'no email'}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-1 py-1">
                                                    <div className="flex items-center justify-between gap-4 max-w-[180px]">
                                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Selling</span>
                                                        <span className="text-xs font-black text-slate-900 dark:text-white">{formatCurrency(booking.totalAmount, booking.currency)}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between gap-4 max-w-[180px]">
                                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Provider</span>
                                                        <span className="text-xs font-bold text-slate-500">{formatCurrency(booking.supplierCost, booking.currency)}</span>
                                                    </div>
                                                    
                                                    {/* Decomposed Markup */}
                                                    <div className="flex flex-col border-t border-slate-100 dark:border-white/5 mt-1 pt-1">
                                                        <div className="flex items-center justify-between gap-4 max-w-[180px]">
                                                            <span className="text-[9px] font-black text-violet-400 uppercase tracking-widest">Markup</span>
                                                            <span className="text-xs font-bold text-violet-500">{formatCurrency(booking.markupAmount, booking.currency)}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between gap-4 max-w-[180px] px-1.5 opacity-60">
                                                            <span className="text-[8px] font-bold text-violet-400 uppercase">Platform Allocation</span>
                                                            <span className="text-[10px] font-medium text-violet-500">{formatCurrency(booking.markupPlatform, booking.currency)}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between gap-4 max-w-[180px] px-1.5 opacity-60">
                                                            <span className="text-[8px] font-bold text-violet-400 uppercase">Operational Margin</span>
                                                            <span className="text-[10px] font-medium text-violet-500">{formatCurrency(booking.markupMargin, booking.currency)}</span>
                                                        </div>
                                                    </div>

                                                    {/* Decomposed Fees */}
                                                    <div className="flex flex-col mt-0.5">
                                                        <div className="flex items-center justify-between gap-4 max-w-[180px]">
                                                            <span className="text-[9px] font-black text-rose-400 uppercase tracking-widest">Fees</span>
                                                            <span className="text-xs font-bold text-rose-500">{formatCurrency(booking.stripeFee, booking.currency)}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between gap-4 max-w-[180px] px-1.5 opacity-60">
                                                            <span className="text-[8px] font-bold text-rose-400 uppercase">Stripe Processing</span>
                                                            <span className="text-[10px] font-medium text-rose-500">{formatCurrency(booking.stripeFeeProcessing, booking.currency)}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between gap-4 max-w-[180px] px-1.5 opacity-60">
                                                            <span className="text-[8px] font-bold text-rose-400 uppercase">Transaction Fixed</span>
                                                            <span className="text-[10px] font-medium text-rose-500">{formatCurrency(booking.stripeFeeFixed, booking.currency)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="inline-flex items-center bg-violet-500/10 px-3 py-1.5 rounded-xl">
                                                    <span className="text-sm font-black text-violet-600 dark:text-violet-400">{booking.markupPercentage}%</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl ${booking.netProfit >= 0 ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`}>
                                                    <TrendingUp size={12} className={booking.netProfit >= 0 ? 'text-emerald-500' : 'text-rose-500 rotate-180'} />
                                                    <span className={`text-sm font-black ${booking.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                        {formatCurrency(booking.netProfit, booking.currency)}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right pr-6">
                                                <div className="text-xs font-bold text-slate-500">{formatDate(booking.createdAt)}</div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>

                    {initialBookings.length === 0 && !isPending && (
                        <div className="py-20 text-center flex flex-col items-center gap-4">
                            <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-3xl text-slate-300">
                                <LayoutDashboard size={40} strokeWidth={1} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">No Financial Data</h3>
                                <p className="text-slate-500 dark:text-slate-400 text-sm max-w-xs mx-auto mt-1 font-medium">
                                    We couldn't find any financial records for the current filters.
                                </p>
                            </div>
                            <Button variant="outline" className="rounded-xl" onClick={() => {
                                setSearchTerm('');
                                updateSearchParam({ q: '', page: 1, status: 'all', supplier: 'all', type: 'all' });
                            }}>Reset Filters</Button>
                        </div>
                    )}

                    {/* Pagination */}
                    <div className="px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100 dark:border-white/5 bg-slate-50/30 dark:bg-white/2">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                            Page {currentPage} of {totalPages || 1} — {totalCount} Items
                        </p>

                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                onClick={() => updateSearchParam({ page: Math.max(1, currentPage - 1) })}
                                disabled={currentPage === 1 || isPending}
                                className="h-10 px-4 rounded-xl border-slate-200 dark:border-white/10 font-bold text-xs uppercase tracking-widest"
                            >
                                Prev
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => updateSearchParam({ page: Math.min(totalPages, currentPage + 1) })}
                                disabled={currentPage === totalPages || totalPages === 0 || isPending}
                                className="h-10 px-4 rounded-xl border-slate-200 dark:border-white/10 font-bold text-xs uppercase tracking-widest text-blue-600"
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {isPending && (
                <div className="fixed bottom-8 right-8 z-50">
                    <div className="bg-white dark:bg-obsidian border border-slate-200 dark:border-white/10 shadow-2xl rounded-2xl px-6 py-3 flex items-center gap-3 animate-in slide-in-from-bottom-4">
                        <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                        <span className="text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">Updating Ledger...</span>
                    </div>
                </div>
            )}
        </div>
    );
}
