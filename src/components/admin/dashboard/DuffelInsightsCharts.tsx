"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { DuffelDayPoint } from '@/types/admin';

// ─── Shared chart constants ─────────────────────────────────

const W = 700;
const H = 200;
const PAD = { top: 20, bottom: 44, left: 46, right: 12 };
const CW = W - PAD.left - PAD.right;
const CH = H - PAD.top - PAD.bottom;

// ─── Helpers ───────────────────────────────────────────────

function niceMax(val: number): number {
    if (val <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(val)));
    return Math.ceil(val / mag) * mag;
}

function shortNum(v: number): string {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}k`;
    return String(Math.round(v));
}

function shortDate(iso: string): string {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

/** Pick ~5 evenly-spaced x-axis tick indices */
function xTicks(len: number): number[] {
    if (len === 0) return [];
    const step = Math.max(1, Math.floor(len / 5));
    const ticks: number[] = [];
    for (let i = 0; i < len; i += step) ticks.push(i);
    if (ticks[ticks.length - 1] !== len - 1) ticks.push(len - 1);
    return ticks;
}

// ─── Shared: Y-axis grid ───────────────────────────────────

function YGrid({ max, steps = 4 }: { max: number; steps?: number }) {
    const ticks = Array.from({ length: steps + 1 }, (_, i) => ({
        val: (max / steps) * i,
        y: PAD.top + CH - (i / steps) * CH,
    }));
    return (
        <>
            {ticks.map(t => (
                <g key={t.val}>
                    <line x1={PAD.left} y1={t.y} x2={W - PAD.right} y2={t.y}
                        stroke="currentColor" strokeWidth={0.8} strokeDasharray="4 3"
                        className="text-slate-100 dark:text-white/5" />
                    <text x={PAD.left - 6} y={t.y + 4} textAnchor="end"
                        fontSize={10} fontWeight={700}
                        className="fill-slate-400 dark:fill-slate-500">
                        {shortNum(t.val)}
                    </text>
                </g>
            ))}
        </>
    );
}

// ─── Shared: X-axis labels ─────────────────────────────────

function XLabels({ data }: { data: DuffelDayPoint[] }) {
    const ticks = xTicks(data.length);
    return (
        <>
            {ticks.map(i => {
                const x = PAD.left + (i / Math.max(data.length - 1, 1)) * CW;
                return (
                    <text key={i} x={x} y={H - 6} textAnchor="middle"
                        fontSize={10} fontWeight={700}
                        className="fill-slate-400 dark:fill-slate-500">
                        {shortDate(data[i].date)}
                    </text>
                );
            })}
        </>
    );
}

// ─── Bar Chart ─────────────────────────────────────────────

interface BarTooltip { idx: number; x: number; y: number; val: number; date: string }

export function OrdersBarChart({ data }: { data: DuffelDayPoint[] }) {
    const [tip, setTip] = useState<BarTooltip | null>(null);
    const max = niceMax(Math.max(...data.map(d => d.orders), 1));
    const barW = Math.max(2, CW / data.length - 2);

    return (
        <div className="relative w-full h-full">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full overflow-visible">
                <defs>
                    <linearGradient id="duf-bar-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity="1" />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity="0.7" />
                    </linearGradient>
                </defs>

                <YGrid max={max} />
                <XLabels data={data} />

                {/* Bars */}
                {data.map((d, i) => {
                    const x = PAD.left + (i / Math.max(data.length - 1, 1)) * CW - barW / 2;
                    const barH = (d.orders / max) * CH;
                    const y = PAD.top + CH - barH;
                    return (
                        <g key={d.date}
                            onMouseEnter={() => setTip({ idx: i, x: x + barW / 2, y, val: d.orders, date: d.date })}
                            onMouseLeave={() => setTip(null)}
                            className="cursor-pointer">
                            <motion.rect
                                x={x} width={barW}
                                initial={{ height: 0, y: PAD.top + CH }}
                                animate={{ height: Math.max(barH, d.orders > 0 ? 2 : 0), y }}
                                transition={{ duration: 0.5, delay: i * 0.012, ease: 'easeOut' }}
                                rx={2}
                                fill={tip?.idx === i ? '#3b82f6' : 'url(#duf-bar-grad)'}
                                opacity={tip !== null && tip.idx !== i ? 0.45 : 1}
                            />
                            {/* Invisible hover hit area */}
                            <rect x={x} y={PAD.top} width={barW} height={CH} fill="transparent" />
                        </g>
                    );
                })}

                {/* Tooltip */}
                {tip && (
                    <g>
                        <rect
                            x={Math.min(Math.max(tip.x - 52, PAD.left), W - PAD.right - 104)}
                            y={tip.y - 50}
                            width={104} height={38} rx={8}
                            className="fill-slate-900 dark:fill-white"
                        />
                        <text
                            x={Math.min(Math.max(tip.x, PAD.left + 52), W - PAD.right - 52)}
                            y={tip.y - 34}
                            textAnchor="middle" fontSize={11} fontWeight={800}
                            className="fill-white dark:fill-slate-900">
                            {shortDate(tip.date)}
                        </text>
                        <text
                            x={Math.min(Math.max(tip.x, PAD.left + 52), W - PAD.right - 52)}
                            y={tip.y - 19}
                            textAnchor="middle" fontSize={10} fontWeight={700}
                            className="fill-slate-300 dark:fill-slate-600">
                            {tip.val} order{tip.val !== 1 ? 's' : ''}
                        </text>
                    </g>
                )}
            </svg>
        </div>
    );
}

// ─── Line Chart ────────────────────────────────────────────

interface LineTip { idx: number; x: number; y: number; val: number; date: string }

export function ValueLineChart({
    data, valueKey, currency, color = '#3b82f6', gradId,
}: {
    data: DuffelDayPoint[];
    valueKey: 'value' | 'orders';
    currency: string;
    color?: string;
    gradId: string;
}) {
    const [tip, setTip] = useState<LineTip | null>(null);
    const vals = data.map(d => d[valueKey] as number);
    const max  = niceMax(Math.max(...vals, 1));

    const pts = data.map((d, i) => ({
        x: PAD.left + (i / Math.max(data.length - 1, 1)) * CW,
        y: PAD.top + CH - ((d[valueKey] as number) / max) * CH,
    }));

    const line = pts.reduce((acc, p, i) =>
        i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`, '');

    const area = pts.length > 0
        ? `${line} L ${pts[pts.length - 1].x} ${PAD.top + CH} L ${pts[0].x} ${PAD.top + CH} Z`
        : '';

    const fmtVal = (v: number) =>
        valueKey === 'value'
            ? v.toLocaleString('en-US', { style: 'currency', currency, maximumFractionDigits: 0 })
            : String(v);

    return (
        <div className="relative w-full h-full">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full overflow-visible">
                <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.18" />
                        <stop offset="100%" stopColor={color} stopOpacity="0" />
                    </linearGradient>
                </defs>

                <YGrid max={max} />
                <XLabels data={data} />

                <AnimatePresence mode="wait">
                    <motion.g key={gradId} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
                        {/* Area fill */}
                        <motion.path d={area} fill={`url(#${gradId})`}
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            transition={{ duration: 0.8 }} />

                        {/* Line */}
                        <motion.path d={line} fill="none" stroke={color} strokeWidth={2.5}
                            strokeLinecap="round" strokeLinejoin="round"
                            initial={{ pathLength: 0, opacity: 0 }}
                            animate={{ pathLength: 1, opacity: 1 }}
                            transition={{ duration: 1.2, ease: 'easeInOut' }} />

                        {/* Hover guide + dots */}
                        {pts.map((p, i) => (
                            <g key={i}
                                onMouseEnter={() => setTip({ idx: i, x: p.x, y: p.y, val: vals[i], date: data[i].date })}
                                onMouseLeave={() => setTip(null)}>
                                {/* Invisible wide hover area */}
                                <rect x={p.x - 8} y={PAD.top} width={16} height={CH} fill="transparent" className="cursor-pointer" />
                                <motion.circle cx={p.x} cy={p.y}
                                    r={tip?.idx === i ? 5 : 3}
                                    fill="white" stroke={color}
                                    strokeWidth={tip?.idx === i ? 2.5 : 1.5}
                                    className="transition-all duration-150"
                                    initial={{ scale: 0 }} animate={{ scale: 1 }}
                                    transition={{ delay: 0.8 + i * 0.01 }} />
                            </g>
                        ))}

                        {/* Tooltip */}
                        {tip && (
                            <g>
                                <line x1={tip.x} y1={PAD.top} x2={tip.x} y2={PAD.top + CH}
                                    stroke={color} strokeWidth={1} strokeDasharray="4 3" opacity={0.5} />
                                <rect
                                    x={Math.min(Math.max(tip.x - 58, PAD.left), W - PAD.right - 116)}
                                    y={tip.y - 54}
                                    width={116} height={40} rx={8}
                                    className="fill-slate-900 dark:fill-white"
                                />
                                <text
                                    x={Math.min(Math.max(tip.x, PAD.left + 58), W - PAD.right - 58)}
                                    y={tip.y - 37}
                                    textAnchor="middle" fontSize={11} fontWeight={800}
                                    className="fill-white dark:fill-slate-900">
                                    {shortDate(tip.date)}
                                </text>
                                <text
                                    x={Math.min(Math.max(tip.x, PAD.left + 58), W - PAD.right - 58)}
                                    y={tip.y - 22}
                                    textAnchor="middle" fontSize={10} fontWeight={700}
                                    className="fill-slate-300 dark:fill-slate-600">
                                    {fmtVal(tip.val)}
                                </text>
                            </g>
                        )}
                    </motion.g>
                </AnimatePresence>
            </svg>
        </div>
    );
}

// ─── Chart Card ────────────────────────────────────────────

export function DuffelChartCard({
    label, value, sub, children,
}: {
    label: string;
    value: React.ReactNode;
    sub?: string;
    children: React.ReactNode;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 rounded-2xl p-6 shadow-sm flex flex-col gap-3 overflow-hidden"
        >
            <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
                <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-slate-900 dark:text-white">{value}</span>
                    {sub && <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{sub}</span>}
                </div>
            </div>
            <div className="flex-1 h-[200px]">{children}</div>
        </motion.div>
    );
}


// ─── 2×2 Insights Grid ─────────────────────────────────────

interface InsightsProps {
    data: DuffelDayPoint[];
    currency: string;
    ordersCancelled: number;
    ordersChanged: number;
    ancillariesSold: number;
    grossAncillaryVolume: number;
    ancillaryAttachmentRate: number;
}

export function DuffelInsightsCharts({
    data, currency,
    ordersCancelled, ordersChanged,
    ancillariesSold, grossAncillaryVolume, ancillaryAttachmentRate,
}: InsightsProps) {
    const totalOrders = data.reduce((s, d) => s + d.orders, 0);
    const totalValue  = data.reduce((s, d) => s + d.value,  0);

    const fmtValue = (v: number) =>
        v.toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 2 });

    // Ancillary timeseries is all zeros (Duffel doesn't expose it in orders API)
    const ancillaryData: DuffelDayPoint[] = data.map(d => ({ date: d.date, orders: 0, value: 0 }));

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="h-[1px] flex-1 bg-slate-100 dark:bg-white/5" />
                <span className="px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Last 30 days</span>
                <div className="h-[1px] flex-1 bg-slate-100 dark:bg-white/5" />
            </div>

            {/* Row 1: Orders Created + Gross Order Value */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <DuffelChartCard label="Orders Created" value={totalOrders}>
                    <OrdersBarChart data={data} />
                </DuffelChartCard>

                <DuffelChartCard label="Gross Order Value" value={fmtValue(totalValue)} sub={currency}>
                    <ValueLineChart
                        data={data}
                        valueKey="value"
                        currency={currency}
                        color="#3b82f6"
                        gradId="duf-line-orders"
                    />
                </DuffelChartCard>
            </div>


            {/* Row 2: Ancillaries Sold + Gross Ancillary Volume */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <DuffelChartCard label="Ancillaries Sold" value={ancillariesSold}>
                    <ValueLineChart
                        data={ancillaryData}
                        valueKey="orders"
                        currency={currency}
                        color="#8b5cf6"
                        gradId="duf-anc-count"
                    />
                </DuffelChartCard>

                <DuffelChartCard label="Gross Ancillary Volume" value={fmtValue(grossAncillaryVolume)} sub={currency}>
                    <ValueLineChart
                        data={ancillaryData}
                        valueKey="value"
                        currency={currency}
                        color="#8b5cf6"
                        gradId="duf-anc-value"
                    />
                </DuffelChartCard>
            </div>

            {/* Bottom stat row — cancelled / changed / ancillary rate */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                    { label: 'Orders Cancelled',       value: ordersCancelled,                    cls: 'text-rose-600 dark:text-rose-400' },
                    { label: 'Orders Changed',         value: ordersChanged,                      cls: 'text-amber-600 dark:text-amber-400' },
                    { label: 'Ancillary Attach Rate',  value: `${ancillaryAttachmentRate}%`,       cls: 'text-cyan-600 dark:text-cyan-400' },
                ].map(s => (
                    <motion.div key={s.label}
                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                        className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 rounded-2xl px-5 py-4 shadow-sm flex flex-col gap-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{s.label}</p>
                        <p className={`text-xl font-black ${s.cls}`}>{s.value}</p>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}
