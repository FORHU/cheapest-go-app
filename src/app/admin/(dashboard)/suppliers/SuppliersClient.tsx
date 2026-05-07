"use client";

import React, { useState, useMemo } from 'react';

import { StatCard } from '@/components/admin/StatCard';
import { Building2, Search, Plane, Hotel, Package, Activity, X } from 'lucide-react';
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
import { formatCurrency, cn, formatStatus } from '@/lib/utils';
import type { SupplierRecord } from '@/lib/server/admin/suppliers';
import { convertCurrency } from '@/lib/currency';

interface SuppliersClientProps {
    initialSuppliers: SupplierRecord[];
    defaultCurrency: string;
}

export function SuppliersClient({ initialSuppliers, defaultCurrency }: SuppliersClientProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState<'all' | 'hotel' | 'flight'>('all');

    const filteredSuppliers = useMemo(() => {
        return initialSuppliers.filter(s => {
            const matchesSearch =
                s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                s.location.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesType = typeFilter === 'all' || s.type === typeFilter;
            return matchesSearch && matchesType;
        });
    }, [searchTerm, typeFilter, initialSuppliers]);

    const totalRevenue = useMemo(() => initialSuppliers.reduce((sum, s) => {
        const converted = convertCurrency(s.totalRevenue, s.currency, defaultCurrency);
        return sum + converted;
    }, 0), [initialSuppliers, defaultCurrency]);
    const totalBookings = useMemo(() => initialSuppliers.reduce((sum, s) => sum + s.bookingCount, 0), [initialSuppliers]);
    const activeCount = useMemo(() => initialSuppliers.filter(s => s.status === 'active').length, [initialSuppliers]);

    return (
        <div className="space-y-10 pb-20">


            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Total Suppliers"
                    value={initialSuppliers.length.toLocaleString()}
                    icon={Building2}
                />
                <StatCard
                    title="Active (30 days)"
                    value={activeCount.toLocaleString()}
                    icon={Activity}
                    variant="blue"
                />
                <StatCard
                    title="Total Bookings"
                    value={totalBookings.toLocaleString()}
                    icon={Package}
                />
                <StatCard
                    title="Total Revenue"
                    value={formatCurrency(totalRevenue, defaultCurrency)}
                    icon={Building2}
                />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 rounded-xl shadow-xl overflow-hidden"
            >
                <div className="p-6 border-b border-slate-100 dark:border-white/5 flex flex-col sm:flex-row gap-4 items-center">
                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <Input
                            placeholder="Search suppliers..."
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
                    <div className="flex gap-2 w-full sm:w-auto">
                        {(['all', 'hotel', 'flight'] as const).map(type => (
                            <Button
                                key={type}
                                variant={typeFilter === type ? 'secondary' : 'ghost'}
                                size="sm"
                                onClick={() => setTypeFilter(type)}
                                className={cn(
                                    'capitalize text-xs font-bold',
                                    typeFilter === type && 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                )}
                            >
                                {type === 'all' ? 'All Types' : type === 'hotel' ? 'Hotels' : 'Flights'}
                            </Button>
                        ))}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-transparent hover:bg-transparent border-none">
                                <TableHead className="py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 pl-6">Supplier</TableHead>
                                <TableHead className="py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Location</TableHead>
                                <TableHead className="py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Type</TableHead>
                                <TableHead className="py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Bookings</TableHead>
                                <TableHead className="py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Revenue</TableHead>
                                <TableHead className="py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 pr-6">Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-slate-100 dark:divide-white/5">
                            {filteredSuppliers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-12 text-slate-400">
                                        No suppliers found
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredSuppliers.map(supplier => (
                                    <TableRow key={supplier.id} className="group hover:bg-slate-50 dark:hover:bg-white/5 transition-colors border-none">
                                        <TableCell className="py-5 pl-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400">
                                                    {supplier.type === 'hotel' ? <Hotel size={18} /> : <Plane size={18} />}
                                                </div>
                                                <span className="font-black text-slate-900 dark:text-white tracking-tight line-clamp-1">{supplier.name}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-5 text-sm text-slate-500 dark:text-slate-400">
                                            {supplier.location}
                                        </TableCell>
                                        <TableCell className="py-5">
                                            <Badge className="w-32 justify-center text-center whitespace-nowrap bg-blue-500/10 text-blue-600 border-none font-medium text-[10px] px-2 py-0.5 rounded">
                                                {formatStatus(supplier.type)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="py-5 font-black text-slate-900 dark:text-white">
                                            {supplier.bookingCount}
                                        </TableCell>
                                        <TableCell className="py-5 font-black text-slate-900 dark:text-white">
                                            {formatCurrency(convertCurrency(supplier.totalRevenue, supplier.currency, defaultCurrency), defaultCurrency)}
                                        </TableCell>
                                        <TableCell className="py-5 pr-6">
                                            <Badge className={cn(
                                                'w-32 justify-center text-center whitespace-nowrap border-none font-medium text-[10px] px-2 py-0.5 rounded',
                                                supplier.status === 'active'
                                                    ? 'bg-emerald-500/10 text-emerald-600'
                                                    : 'bg-slate-500/10 text-slate-500'
                                            )}>
                                                {formatStatus(supplier.status)}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>

                <div className="p-4 border-t border-slate-100 dark:border-white/5 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Showing {filteredSuppliers.length} of {initialSuppliers.length} suppliers
                </div>
            </motion.div>
        </div>
    );
}
