'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, X, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EXCHANGE_RATES, convertCurrency, getCurrencySymbol, refreshExchangeRates } from '@/lib/currency';

/**
 * Format a converted amount as a plain number.
 *
 * The currency is already labelled twice in the result row — by the symbol on the
 * left and the selector on the right — so formatting with `style: 'currency'` here
 * printed it a third time ("IDR IDR 1,794,500") and overflowed the row, which
 * `truncate` then clipped to "IDR 1,…". Currencies without a symbol in
 * getCurrencySymbol() fall back to their code, which made this much worse.
 */
function formatAmount(amount: number): string {
    return new Intl.NumberFormat(undefined, {
        maximumFractionDigits: amount >= 100 ? 0 : 2,
    }).format(amount);
}

interface CurrencyConverterCardProps {
    /** Traveller's home currency (default "from") */
    originCurrency: string;
    /** Destination currency guessed from the booking (default "to") */
    destinationCurrency: string;
}

export function CurrencyConverterCard({ originCurrency, destinationCurrency }: CurrencyConverterCardProps) {
    const t = useTranslations('bookingDestination.currency');
    const [open, setOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    const options = useMemo(() => Object.keys(EXCHANGE_RATES).sort(), []);
    const [from, setFrom] = useState(() => (EXCHANGE_RATES[originCurrency] ? originCurrency : 'USD'));
    const [to, setTo] = useState(() => {
        const homeCcy = EXCHANGE_RATES[originCurrency] ? originCurrency : 'USD';
        const dest = EXCHANGE_RATES[destinationCurrency] ? destinationCurrency : 'USD';
        // Avoid a pointless 1:1 default when home and destination currencies match.
        if (dest !== homeCcy) return dest;
        return homeCcy === 'USD' ? 'EUR' : 'USD';
    });
    const [amount, setAmount] = useState('100');
    // Bumped after a live-rate refresh so the memo below recomputes.
    const [ratesVersion, setRatesVersion] = useState(0);
    const [refreshing, setRefreshing] = useState(false);

    // Hydrate live rates once when the widget first opens.
    useEffect(() => {
        if (!open) return;
        let active = true;
        setRefreshing(true);
        refreshExchangeRates()
            .then(() => { if (active) setRatesVersion((v) => v + 1); })
            .finally(() => { if (active) setRefreshing(false); });
        return () => { active = false; };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const numericAmount = Number(amount.replace(/,/g, '')) || 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const converted = useMemo(() => convertCurrency(numericAmount, from, to), [numericAmount, from, to, ratesVersion]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const unitRate = useMemo(() => convertCurrency(1, from, to), [from, to, ratesVersion]);

    const swap = () => { setFrom(to); setTo(from); };

    const selectCls =
        'appearance-none bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-2.5 pr-6 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500';

    return (
        <div ref={panelRef} className="relative">
            {/* Trigger pill */}
            <button
                onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
                className={`flex items-center gap-1.5 rounded-xl border shadow-sm px-2.5 py-1.5 transition-all active:scale-95 cursor-pointer
                    ${open
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-white'}`}
                aria-label={t('ariaLabel')}
            >
                <ArrowLeftRight size={15} className={open ? 'text-white' : 'text-emerald-500'} />
                <span className="font-extrabold text-xs tabular-nums">{from}/{to}</span>
            </button>

            {open && (
                <div className="absolute top-full right-0 mt-2 w-[320px] max-w-[calc(100vw-24px)] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-xl border border-slate-200/80 dark:border-slate-700/80 shadow-2xl z-50 animate-in fade-in zoom-in-95 slide-in-from-top-2 origin-top-right duration-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t('title')}</p>
                        <button onClick={(e) => { e.stopPropagation(); setOpen(false); }} className="p-1 -mr-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                            <X size={14} />
                        </button>
                    </div>

                    {/* Amount + From */}
                    <div className="flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-3 py-2">
                        <span className="text-slate-400 text-sm font-semibold shrink-0">{getCurrencySymbol(from)}</span>
                        <input
                            type="text"
                            inputMode="decimal"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
                            className="flex-1 min-w-0 bg-transparent text-slate-900 dark:text-white font-bold text-base focus:outline-none"
                            placeholder="0"
                        />
                        <div className="relative shrink-0">
                            <select value={from} onChange={(e) => setFrom(e.target.value)} className={selectCls}>
                                {options.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-[8px]">▼</span>
                        </div>
                    </div>

                    {/* Swap */}
                    <div className="flex justify-center my-1.5">
                        <button
                            onClick={swap}
                            className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-blue-600 hover:border-blue-300 transition-colors active:scale-90 rotate-90"
                            aria-label={t('swap')}
                        >
                            <ArrowLeftRight size={13} />
                        </button>
                    </div>

                    {/* Result + To */}
                    <div className="flex items-center gap-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/40 px-3 py-2">
                        <span className="text-blue-400 text-sm font-semibold shrink-0">{getCurrencySymbol(to)}</span>
                        <span
                            title={`${formatAmount(converted)} ${to}`}
                            className="flex-1 min-w-0 truncate text-blue-700 dark:text-blue-300 font-extrabold text-base tabular-nums"
                        >
                            {formatAmount(converted)}
                        </span>
                        <div className="relative shrink-0">
                            <select value={to} onChange={(e) => setTo(e.target.value)} className={selectCls}>
                                {options.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-[8px]">▼</span>
                        </div>
                    </div>

                    {/* Rate line */}
                    <div className="flex items-center justify-between mt-3">
                        <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                            {t('rate', {
                                from,
                                rate: unitRate.toLocaleString(undefined, { maximumFractionDigits: unitRate < 1 ? 4 : 2 }),
                                to,
                            })}
                        </p>
                        <span className="inline-flex items-center gap-1 text-[9px] text-slate-400">
                            <RefreshCw size={9} className={refreshing ? 'animate-spin' : ''} />
                            {refreshing ? t('updating') : t('liveRates')}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}

export default CurrencyConverterCard;
