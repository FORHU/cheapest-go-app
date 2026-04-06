"use client";

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, ArrowRight, Building2, Plane, ChevronDown, ChevronUp } from 'lucide-react';
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
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 rounded-xl p-8 shadow-md h-full flex flex-col group transition-all duration-500"
        >
            <div className="flex items-center justify-between mb-10 relative z-10">
                <div className="flex-1">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h3 className="text-xl font-black tracking-tight text-slate-900 dark:text-white transition-colors">Top Routes</h3>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 transition-colors">Destination Performance</p>
                        </div>
                    </div>
                </div>
                <div className="ml-4 w-10 h-10 rounded-lg bg-blue-600/10 flex items-center justify-center text-blue-600 transition-colors">
                    <MapPin size={20} />
                </div>
            </div>

            <div className="flex-1 relative z-10">
                <div className="space-y-5 py-2">
                    {routes.length > 0 ? routes.map((route, i) => (
                        <motion.div
                            key={route.destination}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className="group/item relative p-4 rounded-3xl hover:bg-slate-50 dark:hover:bg-white/5 transition-all cursor-default border border-transparent hover:border-slate-100 dark:hover:border-white/10"
                        >
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-500 group-hover/item:bg-blue-600 group-hover/item:text-white transition-all transform group-hover/item:scale-110">
                                        {route.destination.includes('Airport') || route.destination.length === 3 ? <Plane size={24} /> : <MapPin size={24} />}
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-black transition-colors uppercase tracking-tight text-slate-900 dark:text-white group-hover/item:text-blue-600">
                                            {route.destination}
                                        </h4>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                            {route.count} Confirmed Bookings
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right flex flex-col items-end">
                                    <span className="text-sm font-black text-slate-900 dark:text-white transition-colors">
                                        {formatCurrency(route.revenue)}
                                    </span>
                                    <div className="flex items-center text-[9px] font-bold text-emerald-500 uppercase tracking-tighter mt-0.5">
                                        <ArrowRight size={10} className="-rotate-45 mr-0.5" />
                                        <span>High Growth</span>
                                    </div>
                                </div>
                            </div>

                            {/* Progress line */}
                            <div className="h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden transition-colors">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${(route.revenue / maxRevenue) * 100}%` }}
                                    transition={{ duration: 1, delay: 0.5 + i * 0.1 }}
                                    className="h-full bg-blue-600 rounded-full transition-colors"
                                />
                            </div>
                        </motion.div>
                    )) : (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 py-10 opacity-30 transition-colors">
                            <MapPin size={48} className="mb-4" />
                            <p className="text-xs font-black uppercase tracking-[0.2em]">No Route Data</p>
                        </div>
                    )}
                </div>
                <button className="w-full mt-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] hover:text-blue-600 transition-colors border-t border-slate-100 dark:border-white/5">
                    View Detailed Map
                </button>
            </div>
        </motion.div>
    );
}
