'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Fallback for runtimes without Intl.supportedValuesOf (pre-2022 browsers). */
const FALLBACK_ZONES = [
    'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'America/Sao_Paulo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid',
    'Europe/Moscow', 'Africa/Cairo', 'Africa/Lagos', 'Africa/Johannesburg', 'Asia/Dubai',
    'Asia/Karachi', 'Asia/Kolkata', 'Asia/Bangkok', 'Asia/Jakarta', 'Asia/Singapore',
    'Asia/Hong_Kong', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Manila',
    'Australia/Sydney', 'Pacific/Auckland',
];

interface ZoneOption {
    zone: string;
    city: string;
    region: string;
}

/** Every IANA zone the runtime knows about, split into city + region for display. */
function listZones(): ZoneOption[] {
    let zones: string[] = [];
    try {
        // supportedValuesOf is ES2022 and isn't in every TS lib target.
        zones = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
            .supportedValuesOf?.('timeZone') ?? [];
    } catch {
        zones = [];
    }
    if (zones.length === 0) zones = FALLBACK_ZONES;

    return zones.map((zone) => {
        const parts = zone.split('/');
        return {
            zone,
            city: (parts[parts.length - 1] || zone).replace(/_/g, ' '),
            region: parts.length > 1 ? parts[0].replace(/_/g, ' ') : '',
        };
    });
}

interface TimeZonePickerProps {
    title: string;
    /** Currently applied IANA zone, highlighted in the list. */
    value: string;
    /**
     * The auto-detected zone this row falls back to. Pinned to the top of the
     * list as a one-tap way back to the default, so the user never has to hunt
     * for their own zone in 400+ alphabetical entries.
     */
    defaultZone?: string;
    /** Display name for `defaultZone` (e.g. the origin city). */
    defaultLabel?: string;
    onSelect: (zone: string, label: string) => void;
    onBack: () => void;
}

export function TimeZonePicker({
    title,
    value,
    defaultZone,
    defaultLabel,
    onSelect,
    onBack,
}: TimeZonePickerProps) {
    const [query, setQuery] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const allZones = useMemo(listZones, []);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Every zone the runtime knows about — the list scrolls, so there's no cap.
    const results = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return allZones;
        return allZones.filter(
            (z) => z.city.toLowerCase().includes(q) || z.zone.toLowerCase().includes(q)
        );
    }, [query, allZones]);

    // The pinned default is only a shortcut to the top of an unfiltered list;
    // once the user searches, it would just be a duplicate hit.
    const pinnedDefault = useMemo(() => {
        if (!defaultZone || query.trim()) return null;
        const known = allZones.find((z) => z.zone === defaultZone);
        return {
            zone: defaultZone,
            city: defaultLabel || known?.city || defaultZone,
            region: known?.region || defaultZone,
        };
    }, [defaultZone, defaultLabel, query, allZones]);

    return (
        <div className="px-2 pb-2">
            <div className="flex items-center gap-1.5 px-2 pb-2">
                <button
                    onClick={onBack}
                    className="p-1 -ml-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                    aria-label="Back to clocks"
                >
                    <ArrowLeft size={14} />
                </button>
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {title}
                </p>
            </div>

            <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-1.5 mb-1.5">
                <Search size={12} className="text-slate-400 shrink-0" />
                <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search city or zone"
                    className="flex-1 min-w-0 bg-transparent text-xs text-slate-800 dark:text-white focus:outline-none"
                />
            </div>

            <div className="max-h-52 overflow-y-auto">
                {results.length === 0 && !pinnedDefault && (
                    <p className="px-2 py-3 text-[11px] text-slate-400 text-center">
                        No matching time zone
                    </p>
                )}

                {pinnedDefault && (
                    <>
                        <p className="px-2 pt-1 pb-1 text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                            Default
                        </p>
                        <button
                            onClick={() => onSelect(pinnedDefault.zone, pinnedDefault.city)}
                            className={cn(
                                'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors cursor-pointer',
                                pinnedDefault.zone === value
                                    ? 'bg-blue-600'
                                    : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                            )}
                        >
                            <div className="min-w-0 flex-1">
                                <p className={cn(
                                    'text-[11px] font-semibold truncate',
                                    pinnedDefault.zone === value ? 'text-white' : 'text-slate-700 dark:text-slate-200'
                                )}>
                                    {pinnedDefault.city}
                                </p>
                                <p className={cn(
                                    'text-[9px] truncate',
                                    pinnedDefault.zone === value ? 'text-blue-100' : 'text-slate-400'
                                )}>
                                    {pinnedDefault.region}
                                </p>
                            </div>
                            {pinnedDefault.zone === value
                                ? <Check size={12} className="shrink-0 text-white" />
                                : (
                                    <span className="shrink-0 text-[8px] font-bold uppercase tracking-wide text-slate-400 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5">
                                        Auto
                                    </span>
                                )}
                        </button>
                        <p className="px-2 pt-2 pb-1 text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                            All time zones
                        </p>
                    </>
                )}

                {results.map(({ zone, city, region }) => {
                    const active = zone === value;
                    return (
                        <button
                            key={zone}
                            onClick={() => onSelect(zone, city)}
                            className={cn(
                                'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors cursor-pointer',
                                active ? 'bg-blue-600' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                            )}
                        >
                            <div className="min-w-0 flex-1">
                                <p className={cn(
                                    'text-[11px] font-semibold truncate',
                                    active ? 'text-white' : 'text-slate-700 dark:text-slate-200'
                                )}>
                                    {city}
                                </p>
                                <p className={cn(
                                    'text-[9px] truncate',
                                    active ? 'text-blue-100' : 'text-slate-400'
                                )}>
                                    {region || zone}
                                </p>
                            </div>
                            {active && <Check size={12} className="shrink-0 text-white" />}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export default TimeZonePicker;
