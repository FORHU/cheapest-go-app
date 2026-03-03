"use client";

import React, { useState } from 'react';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Users, Search, Filter, MoreHorizontal, UserPlus, Mail, Shield, Trash2, Edit, DollarSign, Calendar, TrendingUp, Award, Clock } from 'lucide-react';
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
import { motion } from 'framer-motion';
import { formatDate, getInitials, formatCurrency } from '@/lib/utils';

type Customer = {
    id: string;
    name: string;
    email: string;
    loyaltyTier: 'platinum' | 'gold' | 'silver' | 'bronze';
    status: 'active' | 'inactive' | 'banned';
    joined: string;
    totalSpend: number;
    totalBookings: number;
    lastBooking: string;
};

const mockCustomers: Customer[] = [
    { id: 'CUS-001', name: 'Sarah Jenkins', email: 'sarah.j@example.com', loyaltyTier: 'gold', status: 'active', joined: '2023-10-15', totalSpend: 4250.50, totalBookings: 12, lastBooking: '2024-02-28' },
    { id: 'CUS-002', name: 'Michael Chen', email: 'm.chen@example.com', loyaltyTier: 'platinum', status: 'active', joined: '2023-11-20', totalSpend: 12840.00, totalBookings: 28, lastBooking: '2024-03-01' },
    { id: 'CUS-003', name: 'Emily Davis', email: 'emily.d@example.com', loyaltyTier: 'bronze', status: 'inactive', joined: '2024-01-05', totalSpend: 120.00, totalBookings: 1, lastBooking: '2024-01-05' },
    { id: 'CUS-004', name: 'James Wilson', email: 'j.wilson@example.com', loyaltyTier: 'silver', status: 'active', joined: '2023-12-12', totalSpend: 1520.00, totalBookings: 5, lastBooking: '2024-02-15' },
    { id: 'CUS-005', name: 'Robert Brown', email: 'robert.b@example.com', loyaltyTier: 'silver', status: 'active', joined: '2024-02-01', totalSpend: 2450.00, totalBookings: 8, lastBooking: '2024-03-02' },
    { id: 'CUS-006', name: 'Lisa Wang', email: 'lisa.w@example.com', loyaltyTier: 'bronze', status: 'banned', joined: '2024-02-15', totalSpend: 0, totalBookings: 0, lastBooking: 'N/A' },
];

export default function AdminCustomersPage() {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredCustomers = mockCustomers.filter(customer =>
        customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getTierVariant = (tier: Customer['loyaltyTier']) => {
        switch (tier) {
            case 'platinum': return 'default'; // Using primary blue
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
        <div className="space-y-6 sm:space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <SectionHeader
                    title="Customers"
                    subtitle="Manage customer profiles and booking history."
                    size="lg"
                    icon={Users}
                />
                <Button size="sm" className="gap-2 bg-blue-600 hover:bg-blue-500 rounded-xl px-4 py-5 h-auto transition-all shadow-lg shadow-blue-500/20">
                    <UserPlus size={16} />
                    Add Customer
                </Button>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Total Customers"
                    value={mockCustomers.length}
                    icon={Users}
                    trend={{ value: 4.8, isPositive: true }}
                />
                <StatCard
                    title="Total Spend"
                    value={formatCurrency(21180.50, 'USD')}
                    icon={DollarSign}
                    trend={{ value: 12.4, isPositive: true }}
                />
                <StatCard
                    title="Avg. Bookings"
                    value="12.4"
                    icon={Calendar}
                    trend={{ value: 2.1, isPositive: true }}
                />
                <StatCard
                    title="Loyalty Members"
                    value="4"
                    icon={Award}
                    trend={{ value: 1, isPositive: true }}
                />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/50 dark:bg-obsidian/50 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden"
            >
                <div className="p-4 border-b border-slate-200 dark:border-white/5 flex flex-col sm:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <Input
                            placeholder="Search customers..."
                            className="pl-10 bg-white/50 dark:bg-white/5 border-white/20 dark:border-white/10"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button variant="ghost" size="sm" className="text-slate-600 dark:text-slate-400">
                        <Filter size={16} className="mr-2" />
                        Filters
                    </Button>
                </div>

                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Customer</TableHead>
                                <TableHead>Tier</TableHead>
                                <TableHead>Total Spend</TableHead>
                                <TableHead>Bookings</TableHead>
                                <TableHead>Last Booking</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredCustomers.map((customer) => (
                                <TableRow key={customer.id}>
                                    <TableCell>
                                        <div className="flex flex-col gap-0.5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 text-xs font-black">
                                                    {getInitials(customer.name.split(' ')[0], customer.name.split(' ')[1])}
                                                </div>
                                                <span className="font-black text-slate-900 dark:text-white tracking-tight">{customer.name}</span>
                                            </div>
                                            <span className="text-[10px] text-slate-400 font-bold ml-11 -mt-1">{customer.email}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={getTierVariant(customer.loyaltyTier) as any} className={`capitalize text-[9px] font-black px-2 py-0.5 rounded-lg ${customer.loyaltyTier === 'platinum' ? 'bg-blue-900 border-0' :
                                                customer.loyaltyTier === 'gold' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                                                    customer.loyaltyTier === 'silver' ? 'bg-slate-100 text-slate-600 border-slate-200' :
                                                        'bg-orange-50 text-orange-600 border-orange-100'
                                            }`}>
                                            {customer.loyaltyTier}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="font-black text-slate-900 dark:text-white">
                                        {formatCurrency(customer.totalSpend, 'USD')}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1 text-slate-900 dark:text-white font-bold">
                                            <TrendingUp size={12} className="text-blue-500" />
                                            {customer.totalBookings}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 leading-none">
                                            <Clock size={12} />
                                            {customer.lastBooking !== 'N/A' ? formatDate(customer.lastBooking) : 'Never'}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={getStatusVariant(customer.status) as any} className="capitalize text-[9px] font-bold">
                                            {customer.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-blue-600">
                                                <Edit size={16} />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-rose-600">
                                                <Trash2 size={16} />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-900 dark:hover:text-white">
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
                    <div className="py-20 text-center">
                        <p className="text-slate-500 dark:text-slate-400">No customers found.</p>
                    </div>
                )}

                <div className="p-4 border-t border-slate-200 dark:border-white/5 flex items-center justify-between text-xs text-slate-500">
                    <p>Showing {filteredCustomers.length} customers</p>
                </div>
            </motion.div>
        </div>
    );
}
