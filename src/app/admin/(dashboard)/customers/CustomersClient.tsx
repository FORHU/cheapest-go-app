"use client";

import React, { useState, useMemo } from 'react';

import { Users, Search, Filter, MoreHorizontal, Trash2, DollarSign, Calendar, TrendingUp, Award, Clock, X, Eye, ShieldBan, ShieldCheck, AlertTriangle } from 'lucide-react';
import { StatCard } from '@/components/admin/StatCard';
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
} from '@/components/ui/Dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDate, getInitials, formatCurrency, cn } from '@/lib/utils';
import { convertCurrency } from '@/lib/currency';
import { Customer } from '@/types/admin';

interface CustomersClientProps {
    initialCustomers: Customer[];
    defaultCurrency?: string;
}

export function CustomersClient({ initialCustomers, defaultCurrency = 'USD' }: CustomersClientProps) {
    const [customers, setCustomers] = useState(initialCustomers);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [tierFilter, setTierFilter] = useState('all');
    const [showFilters, setShowFilters] = useState(false);

    // Action states
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);
    const [banDialogOpen, setBanDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const filteredCustomers = useMemo(() => {
        return customers.filter(customer => {
            const matchesSearch =
                customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                customer.email.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesStatus = statusFilter === 'all' || customer.status === statusFilter;
            const matchesTier = tierFilter === 'all' || customer.loyaltyTier === tierFilter;

            return matchesSearch && matchesStatus && matchesTier;
        });
    }, [searchTerm, statusFilter, tierFilter, customers]);

    const totalSpend = useMemo(() =>
        customers.reduce((sum, c) => sum + c.totalSpend, 0),
        [customers]);

    const avgBookings = useMemo(() => {
        if (customers.length === 0) return 0;
        const total = customers.reduce((sum, c) => sum + c.totalBookings, 0);
        return (total / customers.length).toFixed(1);
    }, [customers]);

    const loyaltyCount = useMemo(() =>
        customers.filter(c => c.loyaltyTier !== 'bronze').length,
        [customers]);

    const getTierVariant = (tier: Customer['loyaltyTier']) => {
        switch (tier) {
            case 'platinum': return 'default';
            case 'gold': return 'secondary';
            case 'silver': return 'outline';
            case 'bronze': return 'ghost';
            default: return 'outline';
        }
    };

    const getStatusVariant = (status: string) => {
        switch (status) {
            case 'active': return 'default';
            case 'inactive': return 'outline';
            case 'banned': return 'destructive';
            default: return 'ghost';
        }
    };

    const handleAction = async (action: 'ban' | 'unban' | 'hard_delete', customer?: Customer) => {
        const target = customer || selectedCustomer;
        if (!target) return;
        setActionLoading(true);
        try {
            const res = await fetch('/api/admin/customers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, userId: target.id }),
            });
            const data = await res.json();

            if (data.success) {
                if (action === 'hard_delete') {
                    setCustomers(prev => prev.filter(c => c.id !== target.id));
                    setDeleteDialogOpen(false);
                    showToast('User permanently deleted', 'success');
                } else if (action === 'ban') {
                    setCustomers(prev => prev.map(c =>
                        c.id === target.id ? { ...c, status: 'banned' as const } : c
                    ));
                    setBanDialogOpen(false);
                    showToast('User has been banned', 'success');
                } else {
                    setCustomers(prev => prev.map(c =>
                        c.id === target.id ? { ...c, status: 'active' as const } : c
                    ));
                    showToast('User has been unbanned', 'success');
                }
            } else {
                showToast(data.error || 'Action failed', 'error');
            }
        } catch {
            showToast('Network error — please try again', 'error');
        } finally {
            setActionLoading(false);
            setSelectedCustomer(null);
        }
    };

    return (
        <div className="space-y-10 pb-20">


            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Total Customers"
                    value={customers.length.toLocaleString()}
                    icon={Users}
                />
                <StatCard
                    title="Total Spend"
                    value={formatCurrency(convertCurrency(totalSpend, 'PHP', defaultCurrency), defaultCurrency)}
                    icon={DollarSign}
                    variant="blue"
                />
                <StatCard
                    title="Avg. Bookings"
                    value={avgBookings.toString()}
                    icon={Calendar}
                />
                <StatCard
                    title="Loyalty Members"
                    value={loyaltyCount.toLocaleString()}
                    icon={Award}
                />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="p-6 bg-white dark:bg-obsidian rounded-xl shadow-xl overflow-hidden border border-slate-200/50 dark:border-white/5"
            >
                <div className="p-4 border-b border-slate-200 dark:border-white/5 flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row gap-4 items-center">
                        <div className="relative flex-1 w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                            <Input
                                placeholder="Search customers..."
                                className="pl-10 bg-white/50 dark:bg-white/5 border-white/20 dark:border-white/10"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                >
                                    <X size={14} />
                                </button>
                            )}
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
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 pb-2">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Loyalty Tier</label>
                                        <select
                                            value={tierFilter}
                                            onChange={(e) => setTierFilter(e.target.value)}
                                            className="w-full bg-white/50 dark:bg-white/5 border border-white/20 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-blue-500/50 transition-colors"
                                        >
                                            <option value="all">All Tiers</option>
                                            <option value="platinum">Platinum</option>
                                            <option value="gold">Gold</option>
                                            <option value="silver">Silver</option>
                                            <option value="bronze">Bronze</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</label>
                                        <select
                                            value={statusFilter}
                                            onChange={(e) => setStatusFilter(e.target.value)}
                                            className="w-full bg-white/50 dark:bg-white/5 border border-white/20 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-blue-500/50 transition-colors"
                                        >
                                            <option value="all">All Statuses</option>
                                            <option value="active">Active</option>
                                            <option value="inactive">Inactive</option>
                                            <option value="banned">Banned</option>
                                        </select>
                                    </div>
                                    <div className="flex items-end">
                                        {(searchTerm || statusFilter !== 'all' || tierFilter !== 'all') && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => {
                                                    setSearchTerm('');
                                                    setStatusFilter('all');
                                                    setTierFilter('all');
                                                }}
                                                className="w-full sm:w-auto text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 px-4 h-[34px]"
                                            >
                                                Reset All Filters
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-transparent hover:bg-transparent border-none">
                                <TableHead className="py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 pl-6">Customer</TableHead>
                                <TableHead className="py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Tier</TableHead>
                                <TableHead className="py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Total Spend</TableHead>
                                <TableHead className="py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Bookings</TableHead>
                                <TableHead className="py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Last Booking</TableHead>
                                <TableHead className="py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Status</TableHead>
                                <TableHead className="py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right pr-6">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-slate-100 dark:divide-white/5">
                            {filteredCustomers.map((customer) => (
                                <TableRow key={customer.id} className="group hover:bg-slate-50 dark:hover:bg-white/5 transition-colors border-none">
                                    <TableCell className="py-5 pl-6">
                                        <div className="flex flex-col gap-0.5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 text-xs font-black">
                                                    {getInitials(customer.name.split(' ')[0], customer.name.split(' ')[1] || '')}
                                                </div>
                                                <span className="font-black text-slate-900 dark:text-white tracking-tight">{customer.name}</span>
                                            </div>
                                            <span className="text-[10px] text-slate-400 font-bold ml-11 -mt-1">{customer.email}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-5">
                                        <Badge variant={getTierVariant(customer.loyaltyTier) as any} className={`w-32 justify-center text-center whitespace-nowrap text-[10px] font-medium px-2 py-0.5 rounded border-none ${customer.loyaltyTier === 'platinum' ? 'bg-blue-900 text-white' :
                                            customer.loyaltyTier === 'gold' ? 'bg-amber-100 text-amber-700' :
                                                customer.loyaltyTier === 'silver' ? 'bg-slate-100 text-slate-600' :
                                                    'bg-orange-50 text-orange-600'
                                            }`}>
                                            {customer.loyaltyTier}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="py-5 font-black text-slate-900 dark:text-white">
                                        {formatCurrency(convertCurrency(customer.totalSpend, 'PHP', defaultCurrency), defaultCurrency)}
                                    </TableCell>
                                    <TableCell className="py-5">
                                        <div className="flex items-center gap-1 text-slate-900 dark:text-white font-bold">
                                            <TrendingUp size={12} className="text-blue-500" />
                                            {customer.totalBookings}
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-5">
                                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 leading-none">
                                            <Clock size={12} />
                                            {customer.lastBooking !== 'N/A' ? formatDate(customer.lastBooking) : 'Never'}
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-5">
                                        <Badge
                                            variant={getStatusVariant(customer.status) as any}
                                            className={`w-32 justify-center text-center whitespace-nowrap font-medium text-[10px] px-2 py-0.5 rounded border-none ${customer.status === 'active' ? 'bg-emerald-500/10 text-emerald-600' :
                                                customer.status === 'inactive' ? 'bg-slate-500/10 text-slate-600' :
                                                    'bg-rose-500/10 text-rose-600'
                                                }`}
                                        >
                                            {customer.status.toLowerCase()}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="py-5 text-right pr-6">
                                        <div className="flex items-center justify-end gap-1">
                                            {/* View Details */}
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-slate-400 hover:text-blue-600 rounded-xl"
                                                onClick={() => { setSelectedCustomer(customer); setDetailOpen(true); }}
                                                title="View Details"
                                            >
                                                <Eye size={16} />
                                            </Button>

                                            {/* Ban / Unban */}
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className={cn(
                                                    "h-8 w-8 rounded-xl",
                                                    customer.status === 'banned'
                                                        ? 'text-emerald-400 hover:text-emerald-600'
                                                        : 'text-slate-400 hover:text-amber-600'
                                                )}
                                                onClick={() => {
                                                    setSelectedCustomer(customer);
                                                    if (customer.status === 'banned') {
                                                        handleAction('unban', customer);
                                                    } else {
                                                        setBanDialogOpen(true);
                                                    }
                                                }}
                                                title={customer.status === 'banned' ? 'Unban User' : 'Ban User'}
                                            >
                                                {customer.status === 'banned' ? <ShieldCheck size={16} /> : <ShieldBan size={16} />}
                                            </Button>

                                            {/* More Menu */}
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl">
                                                        <MoreHorizontal size={16} />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-48 rounded-xl border-slate-100 dark:border-white/10 dark:bg-obsidian shadow-2xl">
                                                    <DropdownMenuItem
                                                        onClick={() => { setSelectedCustomer(customer); setDetailOpen(true); }}
                                                        className="gap-2 text-xs font-bold cursor-pointer rounded-lg"
                                                    >
                                                        <Eye size={14} /> View Profile
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={() => {
                                                            setSelectedCustomer(customer);
                                                            if (customer.status === 'banned') {
                                                                handleAction('unban', customer);
                                                            } else {
                                                                setBanDialogOpen(true);
                                                            }
                                                        }}
                                                        className="gap-2 text-xs font-bold cursor-pointer rounded-lg"
                                                    >
                                                        {customer.status === 'banned'
                                                            ? <><ShieldCheck size={14} /> Unban User</>
                                                            : <><ShieldBan size={14} /> Ban User</>
                                                        }
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem
                                                        onClick={() => { setSelectedCustomer(customer); setDeleteDialogOpen(true); }}
                                                        className="gap-2 text-xs font-bold cursor-pointer rounded-lg text-rose-600 focus:text-rose-600"
                                                    >
                                                        <Trash2 size={14} /> Delete Permanently
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                {filteredCustomers.length === 0 && (
                    <div className="py-24 text-center flex flex-col items-center justify-center gap-4">
                        <div className="p-4 bg-slate-100 dark:bg-white/5 rounded-full text-slate-400">
                            <Search size={32} />
                        </div>
                        <div>
                            <p className="text-slate-900 dark:text-white font-bold">No customers found</p>
                            <p className="text-slate-500 dark:text-slate-400 text-sm">Try adjusting your filters or search term.</p>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                setSearchTerm('');
                                setStatusFilter('all');
                                setTierFilter('all');
                            }}
                            className="mt-2"
                        >
                            Clear All Filters
                        </Button>
                    </div>
                )}

                <div className="p-4 border-t border-slate-200 dark:border-white/5 flex items-center justify-between text-xs text-slate-500">
                    <p>Showing {filteredCustomers.length} customers</p>
                </div>
            </motion.div>

            {/* ── Customer Detail Modal ── */}
            <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
                <DialogContent className="sm:max-w-[480px] p-0">
                    {selectedCustomer && (
                        <div className="p-8">
                            <div className="flex items-center gap-4 mb-8">
                                <div className="w-14 h-14 rounded-xl bg-blue-600 flex items-center justify-center text-white text-lg font-black shadow-lg shadow-blue-600/20">
                                    {getInitials(selectedCustomer.name.split(' ')[0], selectedCustomer.name.split(' ')[1] || '')}
                                </div>
                                <div>
                                    <DialogHeader>
                                        <DialogTitle className="text-2xl tracking-tight">{selectedCustomer.name}</DialogTitle>
                                    </DialogHeader>
                                    <p className="text-sm text-slate-400 font-medium">{selectedCustomer.email}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/5">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Status</p>
                                    <Badge className={cn(
                                        'w-32 justify-center text-center whitespace-nowrap font-medium text-[10px] px-2 py-0.5 rounded border-none',
                                        selectedCustomer.status === 'active' ? 'bg-emerald-500/10 text-emerald-600' :
                                            selectedCustomer.status === 'banned' ? 'bg-rose-500/10 text-rose-600' :
                                                'bg-slate-500/10 text-slate-600'
                                    )}>
                                        {selectedCustomer.status}
                                    </Badge>
                                </div>
                                <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/5">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Loyalty Tier</p>
                                    <Badge className={cn(
                                        'w-32 justify-center text-center whitespace-nowrap text-[10px] font-medium px-2 py-0.5 rounded border-none',
                                        selectedCustomer.loyaltyTier === 'platinum' ? 'bg-blue-900 text-white' :
                                            selectedCustomer.loyaltyTier === 'gold' ? 'bg-amber-100 text-amber-700' :
                                                selectedCustomer.loyaltyTier === 'silver' ? 'bg-slate-100 text-slate-600' :
                                                    'bg-orange-50 text-orange-600'
                                    )}>
                                        {selectedCustomer.loyaltyTier}
                                    </Badge>
                                </div>
                                <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/5">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Total Spend</p>
                                    <p className="text-lg font-black text-slate-900 dark:text-white">{formatCurrency(convertCurrency(selectedCustomer.totalSpend, 'PHP', defaultCurrency), defaultCurrency)}</p>
                                </div>
                                <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/5">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Total Bookings</p>
                                    <p className="text-lg font-black text-slate-900 dark:text-white">{selectedCustomer.totalBookings}</p>
                                </div>
                                <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/5">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Joined</p>
                                    <p className="text-sm font-bold text-slate-900 dark:text-white">{formatDate(selectedCustomer.joined)}</p>
                                </div>
                                <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/5">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Last Booking</p>
                                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                                        {selectedCustomer.lastBooking !== 'N/A' ? formatDate(selectedCustomer.lastBooking) : 'Never'}
                                    </p>
                                </div>
                            </div>

                            <DialogFooter className="mt-8">
                                <DialogClose asChild>
                                    <Button variant="ghost" className="flex-1 rounded-xl font-bold h-12 border border-slate-100 dark:border-white/10">
                                        Close
                                    </Button>
                                </DialogClose>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* ── Ban Confirmation Dialog ── */}
            <Dialog open={banDialogOpen} onOpenChange={(open) => { if (!open) { setBanDialogOpen(false); setSelectedCustomer(null); } }}>
                <DialogContent showCloseButton={false} className="sm:max-w-[420px] p-0">
                    <div className="px-8 pt-8 pb-4">
                        <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 mb-6">
                            <ShieldBan size={24} />
                        </div>
                        <DialogHeader className="space-y-2">
                            <DialogTitle className="text-2xl tracking-tight">Ban User</DialogTitle>
                            <DialogDescription className="text-base leading-relaxed">
                                <strong>{selectedCustomer?.name}</strong> will be banned and unable to access the platform. Their booking history will be preserved. You can unban them at any time.
                            </DialogDescription>
                        </DialogHeader>
                    </div>
                    <DialogFooter className="px-8 pb-8 pt-4 flex flex-col-reverse sm:flex-row gap-3">
                        <DialogClose asChild>
                            <Button variant="ghost" className="flex-1 rounded-xl font-bold h-12 text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 border border-slate-100 dark:border-white/10">
                                Cancel
                            </Button>
                        </DialogClose>
                        <Button
                            onClick={() => handleAction('ban')}
                            disabled={actionLoading}
                            className="flex-1 rounded-xl font-black h-12 shadow-lg border-0 text-white bg-amber-600 hover:bg-amber-700 shadow-amber-600/20"
                        >
                            {actionLoading ? 'Banning...' : 'Ban User'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Hard Delete Confirmation Dialog ── */}
            <Dialog open={deleteDialogOpen} onOpenChange={(open) => { if (!open) { setDeleteDialogOpen(false); setSelectedCustomer(null); } }}>
                <DialogContent showCloseButton={false} className="sm:max-w-[420px] p-0">
                    <div className="px-8 pt-8 pb-4">
                        <div className="w-12 h-12 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500 mb-6">
                            <AlertTriangle size={24} />
                        </div>
                        <DialogHeader className="space-y-2">
                            <DialogTitle className="text-2xl tracking-tight">Delete Permanently</DialogTitle>
                            <DialogDescription className="text-base leading-relaxed">
                                This will permanently delete <strong>{selectedCustomer?.name}</strong> and their authentication account. This action <strong>cannot be undone</strong>. Their existing bookings will become orphaned.
                            </DialogDescription>
                        </DialogHeader>
                    </div>
                    <DialogFooter className="px-8 pb-8 pt-4 flex flex-col-reverse sm:flex-row gap-3">
                        <DialogClose asChild>
                            <Button variant="ghost" className="flex-1 rounded-xl font-bold h-12 text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 border border-slate-100 dark:border-white/10">
                                Cancel
                            </Button>
                        </DialogClose>
                        <Button
                            onClick={() => handleAction('hard_delete')}
                            disabled={actionLoading}
                            className="flex-1 rounded-xl font-black h-12 shadow-lg border-0 text-white bg-rose-600 hover:bg-rose-700 shadow-rose-600/20"
                        >
                            {actionLoading ? 'Deleting...' : 'Delete Forever'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Toast ── */}
            {toast && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className={cn(
                        'fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-2xl text-sm font-bold flex items-center gap-2',
                        toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                    )}
                >
                    {toast.message}
                    <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100">
                        <X size={14} />
                    </button>
                </motion.div>
            )}
        </div>
    );
}
