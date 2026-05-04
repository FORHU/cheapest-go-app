"use client";

import React from 'react';
import { ChevronDown } from 'lucide-react';
import { useUserCurrency, useUserCountry, useSearchActions } from '@/stores/searchStore';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export const CURRENCIES = [
    { code: 'KRW', country: 'KR' },
    { code: 'USD', country: 'US' },
    { code: 'PHP', country: 'PH' },
] as const;

interface CurrencySelectorProps {
    className?: string;
    variant?: 'header' | 'pill';
    align?: 'left' | 'right';
}

const CurrencySelector: React.FC<CurrencySelectorProps> = ({ 
    className, 
    variant = 'header',
    align = 'right'
}) => {
    const userCurrency = useUserCurrency();
    const userCountry = useUserCountry();
    const { setUserCurrency, setUserCountry } = useSearchActions();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const handleCurrencySelect = (currencyCode: string, countryCode: string) => {
        setUserCurrency(currencyCode);
        setUserCountry(countryCode);

        // Only re-fetch for property pages (rates are currency-specific from LiteAPI).
        if (pathname && (pathname.includes('/property/') || pathname.includes('/flights'))) {
            const params = new URLSearchParams(searchParams?.toString() || '');
            params.set('currency', currencyCode);
            router.replace(`${pathname}?${params.toString()}`);
        }
    };

    if (variant === 'pill') {
        return (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        className={cn(
                            "flex items-center gap-1.5 px-3 h-[28px] md:h-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full text-[10px] md:text-sm font-bold text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600 transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 group min-w-[75px] md:min-w-[90px]",
                            className
                        )}
                    >
                        <span className="text-[8px] md:text-[10px] text-slate-400 font-bold uppercase">{userCountry}</span>
                        <span>{userCurrency}</span>
                        <ChevronDown size={12} className="text-slate-400 transition-transform group-data-[state=open]:rotate-180" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align={align} className="rounded-xl min-w-[120px]">
                    {CURRENCIES.map((c) => (
                        <DropdownMenuItem
                            key={c.code}
                            onClick={() => handleCurrencySelect(c.code, c.country)}
                            className={cn(
                                "flex items-center gap-3 px-4 py-2 text-[11px] font-bold transition-colors cursor-pointer",
                                userCurrency === c.code
                                    ? "bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400"
                                    : "text-slate-700 dark:text-slate-300"
                            )}
                        >
                            <span className="text-[9px] text-slate-400 font-bold w-5">{c.country}</span>
                            <span>{c.code}</span>
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        );
    }

    return (
        <div className={cn("relative", className)}>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors group"
                    >
                        <span className="text-xs text-slate-400 font-bold uppercase">{userCountry}</span>
                        <span className="text-sm font-bold">{userCurrency}</span>
                        <ChevronDown className="w-4 h-4 text-slate-400 transition-transform group-data-[state=open]:rotate-180" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align={align} className="rounded-xl min-w-[140px]">
                    {CURRENCIES.map((c) => (
                        <DropdownMenuItem
                            key={c.code}
                            onClick={() => handleCurrencySelect(c.code, c.country)}
                            className={cn(
                                "flex items-center gap-3 px-4 py-2.5 text-sm font-bold transition-colors cursor-pointer",
                                userCurrency === c.code
                                    ? 'bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400'
                                    : 'text-slate-700 dark:text-slate-300'
                            )}
                        >
                            <span className="text-xs text-slate-400 font-bold w-5">{c.country}</span>
                            <span>{c.code}</span>
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
};

export default CurrencySelector;
