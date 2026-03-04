"use client";

import React, { useState } from 'react';
import { HeaderTitle } from '@/components/admin/HeaderTitle';
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
        <div className="space-y-10 pb-20">
            <HeaderTitle
                title="Suppliers"
                subtitle="Manage property owners, hotels, and partners"
                actions={
                    <Button className="bg-blue-600 hover:bg-blue-500 rounded-2xl font-bold h-12 px-6 shadow-xl shadow-blue-500/20 transition-all text-white border-0 gap-2">
                        <Plus size={18} />
                        Add Supplier
                    </Button>
                }
            />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 rounded-[2rem] shadow-xl overflow-hidden"
            >
                <div className="p-6 border-b border-slate-100 dark:border-white/5 flex flex-col sm:flex-row gap-4 items-center">
                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <Input
                            placeholder="Search suppliers..."
                            className="pl-10 bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 rounded-xl"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button variant="outline" className="rounded-xl border-slate-200 dark:border-white/10 dark:bg-white/5 font-black uppercase text-[10px] tracking-widest h-10 px-4">
                        <Filter size={16} className="mr-2" />
                        Filters
                    </Button>
                </div>

                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-b border-slate-100 dark:border-white/5 bg-transparent hover:bg-transparent">
                                <TableHead className="py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 pl-6">Supplier / Property</TableHead>
                                <TableHead className="py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Location</TableHead>
                                <TableHead className="py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Type</TableHead>
                                <TableHead className="py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Avg Rate</TableHead>
                                <TableHead className="py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Rating</TableHead>
                                <TableHead className="py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Status</TableHead>
                                <TableHead className="py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right pr-6">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-slate-100 dark:divide-white/5">
                            {filteredSuppliers.map((supplier) => (
                                <TableRow key={supplier.id} className="group hover:bg-slate-50 dark:hover:bg-white/5 transition-colors border-none">
                                    <TableCell className="py-5 pl-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-slate-100 dark:border-white/10">
                                                <img src={supplier.image} alt={supplier.name} className="w-full h-full object-cover" />
                                            </div>
                                            <span className="font-black text-slate-900 dark:text-white tracking-tight line-clamp-1">{supplier.name}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-5">
                                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-none">
                                            <MapPin size={12} className="text-blue-500" />
                                            <span className="line-clamp-1">{supplier.location}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-5">
                                        <Badge className="bg-blue-500/10 text-blue-600 border-none font-black uppercase text-[9px] px-3 py-1 rounded-lg">
                                            {supplier.type}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="py-5 font-black text-slate-900 dark:text-white">{formatCurrency(supplier.price, 'PHP')}</TableCell>
                                    <TableCell className="py-5">
                                        <div className="flex items-center gap-1 text-amber-500">
                                            <Star size={12} fill="currentColor" />
                                            <span className="text-[10px] font-black">{supplier.rating}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-5">
                                        <Badge className="bg-emerald-500/10 text-emerald-600 border-none font-black uppercase text-[9px] px-3 py-1 rounded-lg">
                                            Active
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

                <div className="p-4 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <p>Total {filteredSuppliers.length} active suppliers</p>
                </div>
            </motion.div>
        </div>
    );
}
