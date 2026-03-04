"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { MapPin, ArrowRight, Building2, Plane } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface RouteMetric {
    destination: string;
    count: number;
    revenue: number;
}

interface TopRoutesProps {
    routes: RouteMetric[];
}

export function TopRoutes({ routes }: TopRoutesProps) {
    const maxRevenue = Math.max(...routes.map(r => r.revenue), 1);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 rounded-[2.5rem] p-8 shadow-xl h-full flex flex-col"
        >
            <div className="flex items-center justify-between mb-10">
                <div>
                    <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Top Routes</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Destination Performance</p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-blue-600/10 flex items-center justify-center text-blue-600">
                    <MapPin size={20} />
                </div>
            </div>

            <div className="flex-1 space-y-5">
                {routes.length > 0 ? routes.map((route, i) => (
                    <motion.div
                        key={route.destination}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="group relative p-4 rounded-3xl hover:bg-slate-50 dark:hover:bg-white/5 transition-all cursor-default border border-transparent hover:border-slate-100 dark:hover:border-white/10"
                    >
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-500 group-hover:bg-blue-600 group-hover:text-white transition-all transform group-hover:scale-110">
                                    {route.destination.includes('Airport') || route.destination.length === 3 ? <Plane size={24} /> : <MapPin size={24} />}
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-slate-900 dark:text-white group-hover:text-blue-600 transition-colors uppercase tracking-tight">
                                        {route.destination}
                                    </h4>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                        {route.count} Confirmed Bookings
                                    </p>
                                </div>
                            </div>
                            <div className="text-right flex flex-col items-end">
                                <span className="text-sm font-black text-slate-900 dark:text-white">
                                    {formatCurrency(route.revenue)}
                                </span>
                                <div className="flex items-center text-[9px] font-bold text-emerald-500 uppercase tracking-tighter mt-0.5">
                                    <ArrowRight size={10} className="-rotate-45 mr-0.5" />
                                    <span>High Growth</span>
                                </div>
                            </div>
                        </div>

                        {/* Progress line */}
                        <div className="h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${(route.revenue / maxRevenue) * 100}%` }}
                                transition={{ duration: 1, delay: 0.5 + i * 0.1 }}
                                className="h-full bg-blue-600 rounded-full"
                            />
                        </div>
                    </motion.div>
                )) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 py-10 opacity-30">
                        <MapPin size={48} className="mb-4" />
                        <p className="text-xs font-black uppercase tracking-[0.2em]">No Route Data</p>
                    </div>
                )}
            </div>

            <button className="w-full mt-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] hover:text-blue-600 transition-colors border-t border-slate-100 dark:border-white/5 group-hover:border-blue-600/20">
                View Detailed Map
            </button>
        </motion.div>
    );
}
