"use client";

import React from 'react';
import Link from 'next/link';
import { Flag, ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { formatMoney } from '@/components/golf/format';
import type { TripGolfBooking, TripGolfStatus } from '@/lib/trips/golfBookings';

/**
 * A golf booking in the bookings list, in the same family as the hotel and flight cards: what it
 * is, when, for whom, what was paid and where it stands. Cancelling, the receipt and the rest live
 * on the booking's own page, which this links to, so the one rule for them is not copied here.
 */

const STATUS_TONE: Record<TripGolfStatus, string> = {
    requested: 'bg-[#ffda09]/[0.52] dark:bg-[#ffda09]/80 text-slate-900',
    confirmed: 'bg-emerald-300/[0.52] dark:bg-emerald-300/80 text-emerald-950',
    declined: 'bg-rose-300/[0.52] dark:bg-rose-300/80 text-rose-950',
    cancelled: 'bg-slate-300/[0.52] dark:bg-slate-300/80 text-slate-900',
};

export default function GolfBookingCard({ booking }: { booking: TripGolfBooking }) {
    const t = useTranslations('trips.golfCard');
    const locale = useLocale();

    // The tee time is read on the course's clock: that is the one the golfer will play by.
    const teeTime = new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium', timeStyle: 'short', ...(booking.timezone ? { timeZone: booking.timezone } : {}),
    }).format(new Date(booking.startsAt));

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 sm:p-4 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
            <div className="flex items-start gap-3">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                    <Flag className="w-5 h-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">{t('badge')}</span>
                        <span className={`inline-flex items-center text-[11px] px-2.5 py-0.5 rounded-full whitespace-nowrap ${STATUS_TONE[booking.status]}`}>
                            {t(`status.${booking.status}`)}
                        </span>
                    </div>
                    <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white truncate mt-0.5">{booking.courseName}</h3>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 tabular-nums">{teeTime}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        <span>{t(booking.players === 1 ? 'player' : 'players', { count: booking.players })}</span>
                        <span aria-hidden> · </span>
                        <span>{t('reference', { reference: booking.reference })}</span>
                    </p>
                </div>

                <div className="text-right shrink-0">
                    <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tabular-nums">
                        {formatMoney(booking.total, booking.currency, locale)}
                    </p>
                </div>
            </div>

            <div className="mt-3 flex justify-end">
                <Link
                    href={`/golf/bookings/${booking.reference}`}
                    className="inline-flex items-center gap-1 text-xs sm:text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                    {t('view')}
                    <ChevronRight className="w-4 h-4" aria-hidden />
                </Link>
            </div>
        </div>
    );
}
