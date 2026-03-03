"use client";

import React, { useState } from 'react';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Building2, Search, Filter, Plus, MoreHorizontal, Edit, Trash2, MapPin, Star } from 'lucide-react';
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
import { formatCurrency } from '@/lib/utils';
import { baguioProperties } from '@/data/mockProperties';

export default function AdminSuppliersPage() {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredSuppliers = baguioProperties.filter(property =>
        property.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        property.location.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6 sm:space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <SectionHeader
                    title="Suppliers"
                    subtitle="Manage property owners, hotels, and partners."
                    size="lg"
                    icon={Building2}
                />
                <Button size="sm" className="gap-2">
                    <Plus size={16} />
                    Add Supplier
                </Button>
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
                            placeholder="Search suppliers..."
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
                                <TableHead>Supplier / Property</TableHead>
                                <TableHead>Location</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Avg Rate</TableHead>
                                <TableHead>Rating</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredSuppliers.map((supplier) => (
                                <TableRow key={supplier.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-white/20">
                                                <img src={supplier.image} alt={supplier.name} className="w-full h-full object-cover" />
                                            </div>
                                            <span className="font-medium text-slate-900 dark:text-white line-clamp-1">{supplier.name}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                            <MapPin size={12} />
                                            <span className="line-clamp-1">{supplier.location}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="secondary" className="capitalize text-[10px]">
                                            {supplier.type}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="font-semibold">{formatCurrency(supplier.price, 'PHP')}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1 text-amber-500">
                                            <Star size={12} fill="currentColor" />
                                            <span className="text-xs font-bold">{supplier.rating}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="default" className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-[10px]">
                                            Active
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-emerald-600">
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

                <div className="p-4 border-t border-slate-200 dark:border-white/5 flex items-center justify-between text-xs text-slate-500">
                    <p>Total {filteredSuppliers.length} active suppliers</p>
                </div>
            </motion.div>
        </div>
    );
}
