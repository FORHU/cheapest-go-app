"use client";

import React, { useState } from 'react';
import { CalendarCheck, DollarSign, Clock, XCircle } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { StatCard } from '@/components/admin/StatCard';
import { formatCurrency } from '@/lib/utils';
import type { DashboardData } from '@/lib/server/adminActions';

interface StatsGridProps {
    liveStats: DashboardData['stats'];
}

export function StatsGrid({ liveStats }: StatsGridProps) {
    const [currency, setCurrency] = useState<'PHP' | 'USD' | 'KRW'>('PHP');

    const rates = {
        PHP: 1,
        USD: 0.018, // 1 PHP = 0.018 USD
        KRW: 23.50  // 1 PHP = 23.50 KRW (Kwon)
    };

    const convertValue = (value: number, targetCurrency: 'PHP' | 'USD' | 'KRW') => {
        return value * rates[targetCurrency];
    };

    const getCurrencyLocale = (curr: string) => {
        switch (curr) {
            case 'USD': return 'en-US';
            case 'KRW': return 'ko-KR';
            default: return 'en-PH';
        }
    };

    const getCurrencyIcon = (curr: string) => {
        switch (curr) {
            case 'USD': return <DollarSign size={18} />;
            case 'KRW': return <span className="font-black text-lg leading-none">₩</span>;
            default: return <span className="font-black text-lg leading-none">₱</span>;
        }
    };

    const stats = [
        {
            title: 'Total Bookings',
            value: liveStats.totalBookings.toLocaleString(),
            icon: CalendarCheck,
            color: 'blue'
        },
        {
            title: 'Revenue',
            value: formatCurrency(convertValue(liveStats.revenue, currency), currency, getCurrencyLocale(currency)),
            icon: () => getCurrencyIcon(currency),
            color: 'white',
            isRevenue: true
        },
        {
            title: 'Pending Bookings',
            value: liveStats.pendingBookings.toLocaleString(),
            icon: Clock,
            color: 'white'
        },
        {
            title: 'Cancelled',
            value: liveStats.cancelledBookings.toLocaleString(),
            icon: XCircle,
            color: 'white'
        },
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat, i) => (
                <StatCard
                    key={stat.title}
                    title={stat.title}
                    value={stat.value}
                    trend={stat.trend}
                    variant={stat.color as any}
                    icon={() => (
                        <div className="w-full h-full flex items-center justify-center">
                            {stat.isRevenue ? (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button className="w-full h-full flex items-center justify-center outline-none">
                                            {getCurrencyIcon(currency)}
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="rounded-2xl border-slate-100 dark:border-white/10 dark:bg-obsidian p-2 shadow-2xl">
                                        <DropdownMenuItem onClick={() => setCurrency('PHP')} className="text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer">PHP (₱)</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => setCurrency('USD')} className="text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer">USD ($)</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => setCurrency('KRW')} className="text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer">KRW (₩)</DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            ) : (
                                typeof stat.icon === 'function' ? stat.icon({}) : React.createElement(stat.icon as any, { size: 18 })
                            )}
                        </div>
                    )}
                />
            ))}
        </div>
    );
}
