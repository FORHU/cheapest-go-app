'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import StripeEmbeddedCheckout from '@/components/checkout/StripeEmbeddedCheckout';

export interface TeeTimeSummary {
    courseName: string;
    courseHref: string;
    date: string;
    time: string;
    greenFeeLabel: string;
    greenFee: string;
    serviceFee: string;
    total: string;
    freeCancel: string;
}

/**
 * The lead player's name, then the card. The card is authorised, not charged: the team captures
 * after the course confirms (CONTEXT.md, "Golf Booking").
 */
export function BookTeeTimeClient({ teeTimeId, players, summary }: { teeTimeId: string; players: number; summary: TeeTimeSummary }) {
    const t = useTranslations('golf.booking');
    const router = useRouter();
    const [leadName, setLeadName] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [payment, setPayment] = useState<{ reference: string; clientSecret: string } | null>(null);

    const start = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const response = await fetch('/api/golf/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
                body: JSON.stringify({ teeTimeId, players, leadName }),
            });
            const json = await response.json().catch(() => ({}));
            if (response.ok) setPayment({ reference: json.data.reference, clientSecret: json.data.clientSecret });
            else if (json.code === 'not_enough_spots') setError(t('notEnoughSpots', { count: json.spotsLeft ?? 0 }));
            else if (json.code === 'tee_time_unavailable') setError(t('unavailable'));
            else if (json.fieldErrors?.leadName) setError(t('leadNameRequired'));
            else if (response.status === 401) setError(t('loginRequired'));
            else setError(t('genericError'));
        } catch {
            setError(t('genericError'));
        } finally {
            setBusy(false);
        }
    };

    const statusPath = payment ? `/golf/bookings/${payment.reference}` : '';
    const row = 'flex justify-between gap-4';

    return (
        <main className="mx-auto grid max-w-5xl gap-8 px-4 py-10 lg:grid-cols-[1fr_22rem]">
            <section className="flex min-w-0 flex-col gap-5">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t('checkoutTitle')}</h1>
                <p className="rounded-xl bg-blue-50 p-4 text-sm leading-relaxed text-blue-900 dark:bg-blue-950/40 dark:text-blue-100">{t('chargeNotice')}</p>
                {payment ? (
                    <StripeEmbeddedCheckout
                        clientSecret={payment.clientSecret}
                        onSuccess={() => router.push(statusPath)}
                        returnUrl={`${window.location.origin}${statusPath}`}
                    />
                ) : (
                    <form onSubmit={start} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-5 dark:border-white/10">
                        <label htmlFor="lead-name" className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('leadName')}</label>
                        <input id="lead-name" required maxLength={120} autoComplete="name" value={leadName}
                            onChange={e => setLeadName(e.target.value)}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-100" />
                        <p className="text-xs text-slate-500 dark:text-slate-400">{t('leadNameHint')}</p>
                        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                        <button type="submit" disabled={busy}
                            className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60">
                            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {t('continueToPayment')}
                        </button>
                    </form>
                )}
            </section>

            <aside className="h-fit rounded-2xl border border-slate-200 p-5 text-sm dark:border-white/10">
                <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">{t('summaryHeading')}</h2>
                <dl className="flex flex-col gap-2 text-slate-600 dark:text-slate-300">
                    <div className={row}><dt>{t('course')}</dt><dd className="text-right"><Link href={summary.courseHref} className="text-blue-600 hover:underline">{summary.courseName}</Link></dd></div>
                    <div className={row}><dt>{t('dateLabel')}</dt><dd className="text-right">{summary.date}</dd></div>
                    <div className={row}><dt>{t('timeLabel')}</dt><dd className="text-right">{summary.time}</dd></div>
                    <div className={row}><dt>{t('playersLabel')}</dt><dd className="text-right">{players}</dd></div>
                </dl>
                <dl className="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-4 tabular-nums text-slate-600 dark:border-white/10 dark:text-slate-300">
                    <div className={row}><dt>{summary.greenFeeLabel}</dt><dd>{summary.greenFee}</dd></div>
                    <div className={row}><dt>{t('serviceFee')}</dt><dd>{summary.serviceFee}</dd></div>
                    <div className={`${row} font-semibold text-slate-900 dark:text-slate-100`}><dt>{t('total')}</dt><dd>{summary.total}</dd></div>
                </dl>
                <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">{summary.freeCancel}</p>
            </aside>
        </main>
    );
}
