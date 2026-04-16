'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Droplets, Wind, Thermometer, Sun, Sunrise, Sunset, Umbrella, X, Cloud } from 'lucide-react';
import type { WeatherData } from '@/hooks/useWeather';

interface WeatherWidgetProps {
    weather: WeatherData | null;
    isLoading: boolean;
    onRefresh?: () => void;
    isFullscreen?: boolean;
}

const formatTime = (isoStr: string) => {
    try {
        const d = new Date(isoStr);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch {
        return '--:--';
    }
};

const getDayLabel = (dateStr: string, idx: number) => {
    if (idx === 0) return 'Today';
    if (idx === 1) return 'Tomorrow';
    try {
        return new Date(dateStr + 'T00:00:00').toLocaleDateString([], { weekday: 'short' });
    } catch {
        return dateStr;
    }
};

const getUvLabel = (uv: number) => {
    if (uv <= 2) return { label: 'Low', color: 'text-green-500' };
    if (uv <= 5) return { label: 'Moderate', color: 'text-yellow-500' };
    if (uv <= 7) return { label: 'High', color: 'text-orange-500' };
    if (uv <= 10) return { label: 'Very High', color: 'text-red-500' };
    return { label: 'Extreme', color: 'text-purple-500' };
};

/** Google Weather icon or fallback cloud icon */
const WeatherIcon = ({ url, size = 20 }: { url: string | null; size?: number }) => {
    if (url) {
        return <img src={url} alt="" width={size} height={size} className="shrink-0 select-none" draggable={false} />;
    }
    return <Cloud size={size} className="text-slate-400 shrink-0" />;
};

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({ weather, isLoading, isFullscreen = true }) => {
    const [open, setOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    // Close popover on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    // Skeleton button
    if (isLoading && !weather) {
        return (
            <div className={`${isFullscreen ? 'w-[60px] h-[36px]' : 'w-[52px] h-[32px]'} bg-white/90 dark:bg-slate-900/90 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg animate-pulse`} />
        );
    }

    if (!weather) return null;

    const { current, hourly, daily, units } = weather;
    const uv = current.uvIndex ?? daily[0]?.uvIndex ?? null;
    const uvInfo = uv !== null ? getUvLabel(uv) : null;

    return (
        <div ref={panelRef} className="relative">
            {/* ── Trigger Button ── */}
            <button
                onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
                className={`flex items-center rounded-xl shadow-lg border transition-all active:scale-95 cursor-pointer
                    ${isFullscreen ? 'gap-1.5 px-2.5 py-1.5' : 'gap-1 px-2 py-1'}
                    ${open
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
            >
                <WeatherIcon url={open ? null : current.iconUrl} size={isFullscreen ? 18 : 16} />
                <span className={`font-extrabold tracking-tight ${isFullscreen ? 'text-xs' : 'text-[10px]'} ${open ? 'text-white' : 'text-slate-800 dark:text-white'}`}>
                    {current.temp}°
                </span>
            </button>

            {/* ── Popover Panel (opens downward) ── */}
            {open && (
                <div className="absolute top-full -right-2 sm:right-0 mt-2 w-[260px] sm:w-[290px] max-w-[calc(100vw-32px)] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-xl border border-slate-200/80 dark:border-slate-700/80 shadow-2xl animate-in fade-in zoom-in-95 slide-in-from-top-2 origin-top-right duration-300 z-50 overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-3 pt-3 pb-2">
                        <div className="flex items-center gap-2.5">
                            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-sky-100 to-blue-50 dark:from-sky-900/40 dark:to-blue-900/30">
                                <WeatherIcon url={current.iconUrl} size={28} />
                            </div>
                            <div>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-xl font-extrabold text-slate-900 dark:text-white">{current.temp}°</span>
                                    <span className="text-[9px] font-medium text-slate-400 uppercase">{units.temp.replace('°', '')}</span>
                                </div>
                                <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 leading-tight">{current.description}</p>
                            </div>
                        </div>
                        <button
                            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
                            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    <div className="h-px bg-gradient-to-r from-transparent via-slate-200 dark:via-slate-700 to-transparent" />

                    {/* Quick stats */}
                    <div className="grid grid-cols-3 gap-1.5 px-3 py-2">
                        <div className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg bg-slate-50/80 dark:bg-slate-800/60">
                            <Thermometer size={12} className="text-orange-500" />
                            <span className="text-[8px] text-slate-400 font-medium">Feels like</span>
                            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">{current.feelsLike}°</span>
                        </div>
                        <div className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg bg-slate-50/80 dark:bg-slate-800/60">
                            <Droplets size={12} className="text-blue-500" />
                            <span className="text-[8px] text-slate-400 font-medium">Humidity</span>
                            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">{current.humidity}%</span>
                        </div>
                        <div className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg bg-slate-50/80 dark:bg-slate-800/60">
                            <Wind size={12} className="text-teal-500" />
                            <span className="text-[8px] text-slate-400 font-medium">Wind</span>
                            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                                {current.windSpeed} <span className="text-[8px] font-normal">{current.windCardinal ? current.windCardinal.slice(0, 3) : ''}</span>
                            </span>
                        </div>
                    </div>

                    {/* UV + Sunrise/Sunset */}
                    {daily[0] && (
                        <div className="flex items-center gap-1.5 px-3 pb-2 flex-wrap">
                            {uvInfo && uv !== null && (
                                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-50/80 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700">
                                    <Sun size={9} className={uvInfo.color} />
                                    <span className={`text-[9px] font-bold ${uvInfo.color}`}>UV {Math.round(uv)}</span>
                                </div>
                            )}
                            {daily[0].sunrise && (
                                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-50/80 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700">
                                    <Sunrise size={9} className="text-amber-500" />
                                    <span className="text-[9px] font-bold text-slate-600 dark:text-slate-300">{formatTime(daily[0].sunrise)}</span>
                                </div>
                            )}
                            {daily[0].sunset && (
                                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-50/80 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700">
                                    <Sunset size={9} className="text-orange-400" />
                                    <span className="text-[9px] font-bold text-slate-600 dark:text-slate-300">{formatTime(daily[0].sunset)}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Hourly forecast */}
                    {hourly.length > 0 && (
                        <div className="px-3 pb-2">
                            <p className="text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Next hours</p>
                            <div className="flex gap-1 overflow-x-auto no-scrollbar scroll-smooth pb-0.5">
                                {hourly.slice(0, 8).map((h, i) => (
                                    <div key={i} className="flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-lg bg-slate-50/60 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700/50 shrink-0 min-w-[40px]">
                                        <span className="text-[8px] font-semibold text-slate-400">
                                            {h.hour === 0 ? '12a' : h.hour < 12 ? `${h.hour}a` : h.hour === 12 ? '12p' : `${h.hour - 12}p`}
                                        </span>
                                        <WeatherIcon url={h.iconUrl} size={16} />
                                        <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200">{h.temp}°</span>
                                        {h.precipChance > 0 && (
                                            <div className="flex items-center gap-0.5">
                                                <Umbrella size={6} className="text-blue-400" />
                                                <span className="text-[7px] font-semibold text-blue-500">{h.precipChance}%</span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 3-day forecast */}
                    {daily.length > 0 && (
                        <div className="px-3 pb-3">
                            <p className="text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Forecast</p>
                            <div className="space-y-0.5">
                                {daily.map((d, i) => (
                                    <div key={d.date} className="flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                                        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 w-[52px] shrink-0">{getDayLabel(d.date, i)}</span>
                                        <WeatherIcon url={d.iconUrl} size={18} />
                                        {d.precipChance > 0 && (
                                            <div className="flex items-center gap-0.5 shrink-0">
                                                <Umbrella size={7} className="text-blue-400" />
                                                <span className="text-[8px] font-bold text-blue-500">{d.precipChance}%</span>
                                            </div>
                                        )}
                                        <div className="flex-1" />
                                        <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200">{d.tempMax}°</span>
                                        <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">{d.tempMin}°</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Powered by Google attribution */}
                    <div className="px-3 pb-2 flex justify-end">
                        <span className="text-[7px] text-slate-300 dark:text-slate-600">Powered by Google Weather</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WeatherWidget;
