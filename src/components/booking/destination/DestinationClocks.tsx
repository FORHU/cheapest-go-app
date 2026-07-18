'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Home, MapPin, X, Sunrise, Moon } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Resolve an IANA-ish time zone for the hotel destination.
 * Prefers the real zone the weather API reports; falls back to a
 * fixed-offset `Etc/GMT` zone estimated from longitude (valid for Intl).
 */
export function resolveDestTimeZone(weatherTz?: string | null, lng?: number): string {
    if (weatherTz && weatherTz.includes('/')) return weatherTz;
    if (typeof lng === 'number' && !isNaN(lng)) {
        const off = Math.max(-12, Math.min(14, Math.round(lng / 15)));
        if (off === 0) return 'UTC';
        // Etc/GMT signs are inverted: Etc/GMT-8 == UTC+8
        const sign = off > 0 ? '-' : '+';
        return `Etc/GMT${sign}${Math.abs(off)}`;
    }
    return weatherTz || 'UTC';
}

/** Offset (in minutes) from UTC for a zone at the given instant. */
function zoneOffsetMinutes(timeZone: string, date: Date): number {
    try {
        const local = new Date(date.toLocaleString('en-US', { timeZone }));
        const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
        return Math.round((local.getTime() - utc.getTime()) / 60000);
    } catch {
        return 0;
    }
}

function fmt(date: Date, timeZone: string, options: Intl.DateTimeFormatOptions): string {
    try {
        return new Intl.DateTimeFormat(undefined, { ...options, timeZone }).format(date);
    } catch {
        return new Intl.DateTimeFormat(undefined, options).format(date);
    }
}

/** Ticking clock — re-renders on the given interval. */
function useNow(intervalMs = 1000): Date {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs]);
    return now;
}

interface ClockRowProps {
    icon: React.ReactNode;
    label: string;
    sublabel: string;
    now: Date;
    timeZone: string;
    accent: string;
}

function ClockRow({ icon, label, sublabel, now, timeZone, accent }: ClockRowProps) {
    const time = fmt(now, timeZone, { hour: '2-digit', minute: '2-digit', hour12: true });
    const seconds = fmt(now, timeZone, { second: '2-digit' });
    const date = fmt(now, timeZone, { weekday: 'short', month: 'short', day: 'numeric' });
    const hour24 = Number(fmt(now, timeZone, { hour: '2-digit', hour12: false }));
    const isDay = hour24 >= 6 && hour24 < 18;

    return (
        <div className="flex items-center gap-3 py-2.5">
            <div className={`flex items-center justify-center w-9 h-9 rounded-xl shrink-0 ${accent}`}>
                {icon}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide truncate">{label}</p>
                    {isDay
                        ? <Sunrise size={11} className="text-amber-500 shrink-0" />
                        : <Moon size={11} className="text-indigo-400 shrink-0" />}
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{sublabel}</p>
            </div>
            <div className="text-right shrink-0">
                <p className="font-extrabold text-slate-900 dark:text-white leading-none tabular-nums">
                    {time}
                    <span className="text-[10px] font-semibold text-slate-400 ml-0.5 align-top">:{seconds}</span>
                </p>
                <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 mt-1">{date}</p>
            </div>
        </div>
    );
}

interface DestinationClocksProps {
    originLabel: string;
    originTimeZone: string;
    destinationLabel: string;
    destinationTimeZone: string;
}

export function DestinationClocks({
    originLabel,
    originTimeZone,
    destinationLabel,
    destinationTimeZone,
}: DestinationClocksProps) {
    const t = useTranslations('bookingDestination.clocks');
    const now = useNow(1000);
    const [open, setOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const destTime = fmt(now, destinationTimeZone, { hour: '2-digit', minute: '2-digit', hour12: true });

    const diff = useMemo(() => {
        const hours = Math.round((zoneOffsetMinutes(destinationTimeZone, now) - zoneOffsetMinutes(originTimeZone, now)) / 60 * 10) / 10;
        if (hours === 0) return t('diffSame');
        return t(hours > 0 ? 'diffAhead' : 'diffBehind', { hours: Math.abs(hours) });
    }, [destinationTimeZone, originTimeZone, now, t]);

    return (
        <div ref={panelRef} className="relative">
            {/* Trigger pill */}
            <button
                onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
                className={`flex items-center gap-1.5 rounded-xl border shadow-sm px-2.5 py-1.5 transition-all active:scale-95 cursor-pointer
                    ${open
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-white'}`}
                aria-label={t('ariaTrigger')}
            >
                <Clock size={16} className={open ? 'text-white' : 'text-blue-500'} />
                <span className="font-extrabold text-xs tabular-nums">{destTime}</span>
            </button>

            {open && (
                <div className="absolute top-full right-0 mt-2 w-[280px] max-w-[calc(100vw-24px)] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-xl border border-slate-200/80 dark:border-slate-700/80 shadow-2xl z-50 animate-in fade-in zoom-in-95 slide-in-from-top-2 origin-top-right duration-200">
                    <div className="flex items-center justify-between px-4 pt-3 pb-1">
                        <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t('title')}</p>
                        <button onClick={(e) => { e.stopPropagation(); setOpen(false); }} className="p-1 -mr-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                            <X size={14} />
                        </button>
                    </div>
                    <div className="px-4 divide-y divide-slate-100 dark:divide-slate-800">
                        <ClockRow
                            icon={<Home size={16} className="text-slate-600 dark:text-slate-300" />}
                            label={t('home')}
                            sublabel={originLabel}
                            now={now}
                            timeZone={originTimeZone}
                            accent="bg-slate-100 dark:bg-slate-800"
                        />
                        <ClockRow
                            icon={<MapPin size={16} className="text-blue-600 dark:text-blue-400" />}
                            label={t('destination')}
                            sublabel={destinationLabel}
                            now={now}
                            timeZone={destinationTimeZone}
                            accent="bg-blue-100 dark:bg-blue-900/40"
                        />
                    </div>
                    <div className="px-4 py-2.5">
                        <div className="flex items-center justify-center gap-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 py-1.5">
                            <Clock size={11} className="text-blue-500" />
                            <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">{diff}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default DestinationClocks;
