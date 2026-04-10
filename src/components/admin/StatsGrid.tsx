"use client";

import React, { useState } from 'react';
import { CalendarCheck, Clock, XCircle } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { StatCard } from '@/components/admin/StatCard';
import { formatCurrency } from '@/lib/utils';
import { convertCurrency } from '@/lib/currency';
import type { DashboardData } from '@/types/admin';
import { useUserCurrency, useSearchActions } from '@/stores/searchStore';

interface StatsGridProps {
    liveStats: DashboardData['stats'];
    defaultCurrency?: string;
}

export function StatsGrid({ liveStats, defaultCurrency }: StatsGridProps) {
    const userCurrency = useUserCurrency();
    const { setUserCurrency } = useSearchActions();
    const [currency, setCurrency] = useState(defaultCurrency || userCurrency || 'PHP');

    // Sync with global currency changes only if the platform default is absent or if it's an explicit manual shift
    React.useEffect(() => {
        if (!defaultCurrency && userCurrency) {
            setCurrency(userCurrency);
        }
    }, [userCurrency, defaultCurrency]);

    const convertValue = (value: number, targetCurrency: string) => {
        return convertCurrency(value, 'PHP', targetCurrency);
    };

    const getCurrencyLocale = (curr: string) => {
        const localeMap: Record<string, string> = { USD: 'en-US', KRW: 'ko-KR', PHP: 'en-PH', JPY: 'ja-JP', EUR: 'de-DE', GBP: 'en-GB', SGD: 'en-SG', AUD: 'en-AU', CAD: 'en-CA', CNY: 'zh-CN', THB: 'th-TH' };
        return localeMap[curr] || 'en-US';
    };

    const getCurrencySymbol = (curr: string) => {
        try {
            return new Intl.NumberFormat('en', { style: 'currency', currency: curr }).formatToParts(0).find(p => p.type === 'currency')?.value || curr;
        } catch { return curr; }
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
            icon: () => <span className="font-black text-lg leading-none">{getCurrencySymbol(currency)}</span>,
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
                    variant={stat.color as any}
                    icon={() => (
                        <div className="w-full h-full flex items-center justify-center">
                            {stat.isRevenue ? (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button className="w-full h-full flex items-center justify-center outline-none">
                                            <span className="font-black text-lg leading-none">{getCurrencySymbol(currency)}</span>
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="rounded-xl border-slate-100 dark:border-white/10 dark:bg-obsidian p-2 shadow-2xl max-h-48 overflow-y-auto">
                                        {['PHP', 'USD', 'KRW', 'JPY', 'EUR', 'GBP', 'SGD', 'AUD', 'CAD', 'THB', 'MYR', 'CNY'].map(c => (
                                            <DropdownMenuItem key={c} onClick={() => {
                                                setCurrency(c);
                                                setUserCurrency(c);
                                            }} className="text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer">
                                                {c} ({getCurrencySymbol(c)})
                                            </DropdownMenuItem>
                                        ))}
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
