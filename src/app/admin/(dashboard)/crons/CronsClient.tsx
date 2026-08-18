"use client";

import React, { useState } from 'react';
import { Play, CheckCircle, XCircle, Loader2, Clock, RefreshCw } from 'lucide-react';
import { apiFetch } from '@/lib/api/client';

interface CronDef {
    id: string;
    label: string;
    description: string;
    schedule: string;
    warning?: string;
}

const CRONS: CronDef[] = [
    { id: 'poll-pending-tickets',           label: 'Poll Pending Tickets',          description: 'Polls Mystifly/Duffel for pending flight ticket status updates.',  schedule: 'Every 5 min' },
    { id: 'check-price-alerts',             label: 'Price Alerts',                  description: 'Sends email notifications for triggered flight price alerts.',      schedule: 'Hourly' },
    { id: 'refresh-popular-flights',        label: 'Refresh Popular Flights',       description: 'Pre-fetches and caches the most-searched flight routes.',           schedule: 'Hourly' },
    { id: 'sync-flight-deals',             label: 'Sync Flight Deals',             description: 'Syncs curated flight deals from providers into the deals table.',   schedule: 'Hourly' },
    { id: 'cache-cleanup',                  label: 'Cache Cleanup',                 description: 'Purges expired search cache rows and stale hotel review items.',    schedule: 'Daily' },
    { id: 'cleanup-sessions',              label: 'Session Cleanup',               description: 'Deletes expired auth sessions and password reset tokens.',          schedule: 'Daily 4am' },
    { id: 'otv-credit-check',              label: 'OTV Credit Check',              description: 'Monitors TravelgateX OTV credit balance and alerts when low.',      schedule: 'Daily' },
    { id: 'fill-dest-cache',               label: 'Fill Destination Cache',        description: 'Pre-populates TGX destination code cache for fast hotel lookups.',  schedule: 'Daily' },
    { id: 'sync-dest-cache',               label: 'Sync Destination Cache',        description: 'Syncs destination cache with latest TravelgateX city data.',       schedule: 'Daily' },
    { id: 'cleanup-orphaned-duffel-orders', label: 'Cleanup Orphaned Duffel Orders', description: 'Cancels Duffel orders with no matching booking record in the DB.', schedule: 'Daily' },
    { id: 'etg-reviews-sync',              label: 'ETG Reviews Sync',              description: 'Syncs hotel review scores and content from the ETG reviews API.',   schedule: 'Nightly' },
    { id: 'geocode-hotels',                label: 'Geocode Hotels',                description: 'Adds lat/lng coordinates to hotels missing location data.',         schedule: 'Nightly' },
    { id: 'refresh-hotel-content',         label: 'Refresh Hotel Content',         description: 'Refreshes full hotel metadata from TravelgateX (slow — ~10 min).', schedule: 'Weekly', warning: 'Long-running — may take up to 10 minutes.' },
];

interface RunResult {
    success: boolean;
    durationMs?: number;
    result?: Record<string, unknown>;
    error?: string;
}

export default function CronsClient() {
    const [running, setRunning] = useState<Record<string, boolean>>({});
    const [results, setResults] = useState<Record<string, RunResult>>({});

    const runCron = async (id: string) => {
        setRunning(r => ({ ...r, [id]: true }));
        setResults(r => { const next = { ...r }; delete next[id]; return next; });

        try {
            const res = await apiFetch<{ success: boolean; durationMs: number; result: Record<string, unknown> }>(
                '/api/admin/run-cron',
                { cron: id }
            );
            if (res.success && res.data) {
                setResults(r => ({ ...r, [id]: { success: res.data!.success, durationMs: res.data!.durationMs, result: res.data!.result } }));
            } else {
                setResults(r => ({ ...r, [id]: { success: false, error: 'error' in res ? res.error : 'Failed' } }));
            }
        } catch (e: any) {
            setResults(r => ({ ...r, [id]: { success: false, error: e.message || 'Network error' } }));
        } finally {
            setRunning(r => ({ ...r, [id]: false }));
        }
    };

    return (
        <div className="p-4 lg:p-8 space-y-6">
            <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Cron Jobs</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Manually trigger any scheduled job. Results appear inline.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {CRONS.map((cron) => {
                    const isRunning = !!running[cron.id];
                    const result = results[cron.id];

                    return (
                        <div key={cron.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl p-4 flex flex-col gap-3">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-900 dark:text-white leading-tight">{cron.label}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">{cron.description}</p>
                                </div>
                                <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                    <Clock size={9} />
                                    {cron.schedule}
                                </span>
                            </div>

                            {cron.warning && !result && (
                                <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-lg">{cron.warning}</p>
                            )}

                            {result && (
                                <div className={`text-[11px] rounded-lg px-2.5 py-2 ${result.success ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'}`}>
                                    <div className="flex items-center gap-1.5 font-semibold mb-1">
                                        {result.success
                                            ? <><CheckCircle size={12} /> Completed {result.durationMs != null ? `in ${(result.durationMs / 1000).toFixed(1)}s` : ''}</>
                                            : <><XCircle size={12} /> Failed</>
                                        }
                                    </div>
                                    {result.error && <p className="opacity-80">{result.error}</p>}
                                    {result.result && (
                                        <pre className="mt-1 text-[10px] opacity-70 whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
                                            {JSON.stringify(result.result, null, 2)}
                                        </pre>
                                    )}
                                </div>
                            )}

                            <button
                                onClick={() => runCron(cron.id)}
                                disabled={isRunning}
                                className="mt-auto flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors
                                    bg-slate-900 hover:bg-slate-700 dark:bg-white dark:hover:bg-slate-200
                                    text-white dark:text-slate-900
                                    disabled:opacity-50 disabled:cursor-wait"
                            >
                                {isRunning
                                    ? <><Loader2 size={12} className="animate-spin" /> Running…</>
                                    : <><Play size={12} /> Run Now</>
                                }
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
