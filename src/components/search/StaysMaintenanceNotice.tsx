'use client';

import React from 'react';
import Link from 'next/link';
import { WrenchIcon, PlaneTakeoffIcon, ArrowRightIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Shown wherever a stay would normally be searched or booked, while hotel supply is off.
 *
 * Deliberately not an amber alert bar. Nothing the visitor did has failed and the rest of
 * the site still sells, so this reads as a considered empty state — neutral surface, one
 * small amber accent — rather than a warning stripe across the page. The flights route out
 * is the point of the panel: a dead end offering nowhere to go reads as a broken site.
 *
 * `compact` is the in-page form used above a property's rooms, where the page already has
 * its own heading and the full-height centred treatment would shove the content off screen.
 */
export function StaysMaintenanceNotice({
    compact = false,
    className = '',
}: {
    compact?: boolean;
    className?: string;
}) {
    const t = useTranslations('hotels.maintenance');

    const flightsLink = (
        <Link
            href="/flights"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-700"
        >
            <PlaneTakeoffIcon size={16} />
            {t('flightsCta')}
            <ArrowRightIcon size={14} />
        </Link>
    );

    if (compact) {
        return (
            <div
                role="status"
                className={`rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5 ${className}`}
            >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
                        <WrenchIcon size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
                            {t('title')}
                        </h2>
                        <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                            {t('description')}
                        </p>
                    </div>
                    <div className="shrink-0">{flightsLink}</div>
                </div>
            </div>
        );
    }

    return (
        <div
            role="status"
            className={`mx-auto flex min-h-[68vh] w-full max-w-xl flex-col items-center justify-center px-4 py-16 text-center ${className}`}
        >
            {/* Soft bloom behind the mark so the panel has a focal point without a filled box. */}
            <div className="relative mb-7">
                <div className="absolute inset-0 rounded-2xl bg-amber-400/25 blur-2xl" aria-hidden />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
                    <WrenchIcon size={26} />
                </div>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
                {t('title')}
            </h1>

            <p className="mt-3.5 text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
                {t('description')}
            </p>

            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                {t('note')}
            </div>

            <div className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                {flightsLink}
                <Link
                    href="/"
                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                >
                    {t('homeCta')}
                </Link>
            </div>
        </div>
    );
}

export default StaysMaintenanceNotice;
