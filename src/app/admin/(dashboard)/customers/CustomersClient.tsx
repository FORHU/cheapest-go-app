"use client";

import React, { useState, useMemo } from 'react';
import { HeaderTitle } from '@/components/admin/HeaderTitle';
import { Users, Search, Filter, MoreHorizontal, UserPlus, Trash2, Edit, DollarSign, Calendar, TrendingUp, Award, Clock } from 'lucide-react';
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
import { motion, AnimatePresence } from 'framer-motion';
import { formatDate, getInitials, formatCurrency, cn } from '@/lib/utils';
import { Customer } from '@/types/admin';
import { X } from 'lucide-react';

interface CustomersClientProps {
    initialCustomers: Customer[];
}

export function CustomersClient({ initialCustomers }: CustomersClientProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [tierFilter, setTierFilter] = useState('all');
    const [showFilters, setShowFilters] = useState(false);

    const filteredCustomers = useMemo(() => {
        return initialCustomers.filter(customer => {
            const matchesSearch =
                customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                customer.email.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesStatus = statusFilter === 'all' || customer.status === statusFilter;
            const matchesTier = tierFilter === 'all' || customer.loyaltyTier === tierFilter;

            return matchesSearch && matchesStatus && matchesTier;
        });
    }, [searchTerm, statusFilter, tierFilter, initialCustomers]);

    // Calculate aggregate stats
    const totalSpend = useMemo(() =>
        initialCustomers.reduce((sum, c) => sum + c.totalSpend, 0),
        [initialCustomers]);

    const avgBookings = useMemo(() => {
        if (initialCustomers.length === 0) return 0;
        const total = initialCustomers.reduce((sum, c) => sum + c.totalBookings, 0);
        return (total / initialCustomers.length).toFixed(1);
    }, [initialCustomers]);

    const loyaltyCount = useMemo(() =>
        initialCustomers.filter(c => c.loyaltyTier !== 'bronze').length,
        [initialCustomers]);

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

    return (
        <div className="space-y-10 pb-20">
            <HeaderTitle
                title="Customers"
                subtitle="Manage customer profiles and booking history"
                actions={
                    <Button className="bg-blue-600 hover:bg-blue-500 rounded-xl font-bold h-12 px-6 shadow-xl shadow-blue-500/20 transition-all text-white border-0 gap-2">
                        <UserPlus size={18} />
                        Add Customer
                    </Button>
                }
            />

            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Total Customers"
                    value={initialCustomers.length.toLocaleString()}
                    icon={Users}
                    trend="+4.8%"
                />
                <StatCard
                    title="Total Spend"
                    value={formatCurrency(totalSpend, 'PHP')}
                    icon={DollarSign}
                    trend="+12.4%"
                    variant="blue"
                />
                <StatCard
                    title="Avg. Bookings"
                    value={avgBookings.toString()}
                    icon={Calendar}
                    trend="+2.1%"
                />
                <StatCard
                    title="Loyalty Members"
                    value={loyaltyCount.toLocaleString()}
                    icon={Award}
                    trend="+1.0%"
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
                                        <Badge variant={getTierVariant(customer.loyaltyTier) as any} className={`capitalize text-[9px] font-black px-2 py-0.5 rounded-lg border-none ${customer.loyaltyTier === 'platinum' ? 'bg-blue-900 text-white' :
                                            customer.loyaltyTier === 'gold' ? 'bg-amber-100 text-amber-700' :
                                                customer.loyaltyTier === 'silver' ? 'bg-slate-100 text-slate-600' :
                                                    'bg-orange-50 text-orange-600'
                                            }`}>
                                            {customer.loyaltyTier}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="py-5 font-black text-slate-900 dark:text-white">
                                        {formatCurrency(customer.totalSpend, 'PHP')}
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
                                            className={`font-black capitalize text-[9px] px-3 py-1 rounded-lg border-none ${customer.status === 'active' ? 'bg-emerald-500/10 text-emerald-600' :
                                                customer.status === 'inactive' ? 'bg-slate-500/10 text-slate-600' :
                                                    'bg-rose-500/10 text-rose-600'
                                                }`}
                                        >
                                            {customer.status.toLowerCase()}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="py-5 text-right pr-6">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-blue-600 rounded-xl">
                                                <Edit size={16} />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-rose-600 rounded-xl">
                                                <Trash2 size={16} />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl">
                                                <MoreHorizontal size={16} />
                                            </Button>
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
        </div>
    );
}
