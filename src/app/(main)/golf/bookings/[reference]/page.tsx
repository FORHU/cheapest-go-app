import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { getBookingForUser, syncPayment } from '@/lib/server/golf/bookings';
import { isBookingReference } from '@/lib/bookingReference';
import { cancellationFor } from '@/lib/golf/rules';
import { localTime } from '@/lib/golf/time';
import { formatMoney } from '@/components/golf/format';
import { CancelGolfBookingButton } from '@/components/golf/CancelGolfBookingButton';
import { TeeTimeButton } from '@/components/golf/TeeTimeButton';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

type Props = { params: Promise<{ reference: string }> };

/** One customer's tee-time booking: where it stands, what it cost, and what they can still do. */
export default async function GolfBookingPage({ params }: Props) {
    const { reference } = await params;
    const { user } = await getAuthenticatedUser();
    if (!user) redirect(`/login?next=${encodeURIComponent(`/golf/bookings/${reference}`)}`);
    if (!isBookingReference(reference)) notFound();

    const found = await getBookingForUser(reference, user.id);
    if (!found) notFound();
    // A redirect payment method, or a closed tab, can land the customer here before the webhook.
    const booking = found.status === 'held' ? ((await syncPayment(found.id).catch(() => null)) ?? found) : found;

    const [t, locale] = await Promise.all([getTranslations('golf.booking'), getLocale()]);
    const tz = booking.timezone ?? 'UTC';
    const money = (amount: number) => formatMoney(amount, booking.currency, locale);
    const courseClock = (iso: string, options: Intl.DateTimeFormatOptions) =>
        new Intl.DateTimeFormat(locale, { timeZone: tz, ...options }).format(new Date(iso));
    const dateTime = (iso: string) => courseClock(iso, { dateStyle: 'medium', timeStyle: 'short' });

    const body = {
        held: t('status.held.body', { time: localTime(new Date(booking.holdExpiresAt), tz) }),
        requested: t('status.requested.body', { total: money(booking.total), date: dateTime(booking.decideBy ?? booking.startsAt) }),
        confirmed: t('status.confirmed.body', { total: money(booking.total) }),
        expired: t('status.expired.body'),
        declined: t('status.declined.body'),
        cancelled: booking.refundAmount > 0
            ? t('status.cancelled.refunded', { amount: money(booking.refundAmount) })
            : t('status.cancelled.notCharged'),
    }[booking.status];

    const Icon = booking.status === 'confirmed' ? CheckCircle2
        : booking.status === 'held' || booking.status === 'requested' ? Clock : XCircle;
    const tone = booking.status === 'confirmed' ? 'text-emerald-600'
        : booking.status === 'held' || booking.status === 'requested' ? 'text-amber-500' : 'text-slate-400';

    const cancellation = cancellationFor(
        { status: booking.status, total: booking.total, freeCancelUntil: new Date(booking.freeCancelUntil) },
        new Date(),
    );
    const row = 'flex justify-between gap-4';

    return (
        <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
            <header className="flex items-start gap-3">
                <Icon className={`mt-1 h-7 w-7 shrink-0 ${tone}`} aria-hidden />
                <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{t('bookingTitle')} · {booking.reference}</p>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t(`status.${booking.status}.title`)}</h1>
                    <p className="mt-2 text-slate-600 dark:text-slate-300">{body}</p>
                </div>
            </header>

            <section className="rounded-2xl border border-slate-200 p-5 text-sm dark:border-white/10">
                <dl className="flex flex-col gap-2 text-slate-600 dark:text-slate-300">
                    <div className={row}><dt>{t('course')}</dt><dd className="text-right"><Link href={`/golf/${booking.courseSlug}`} className="text-blue-600 hover:underline">{booking.courseName}</Link></dd></div>
                    <div className={row}><dt>{t('dateLabel')}</dt><dd className="text-right">{courseClock(booking.startsAt, { dateStyle: 'full' })}</dd></div>
                    <div className={row}><dt>{t('timeLabel')}</dt><dd className="text-right">{t('courseTime', { time: localTime(new Date(booking.startsAt), tz) })}</dd></div>
                    <div className={row}><dt>{t('playersLabel')}</dt><dd className="text-right">{booking.players}</dd></div>
                    <div className={row}><dt>{t('leadPlayer')}</dt><dd className="text-right">{booking.leadName}</dd></div>
                    <div className={row}><dt>{t('reference')}</dt><dd className="text-right font-mono">{booking.reference}</dd></div>
                </dl>
                <dl className="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-4 tabular-nums text-slate-600 dark:border-white/10 dark:text-slate-300">
                    <div className={row}><dt>{t('greenFee', { players: booking.players, price: money(booking.pricePerPlayer) })}</dt><dd>{money(booking.greenFeeTotal)}</dd></div>
                    <div className={row}><dt>{t('serviceFee')}</dt><dd>{money(booking.serviceFee)}</dd></div>
                    <div className={`${row} font-semibold text-slate-900 dark:text-slate-100`}><dt>{t('total')}</dt><dd>{money(booking.total)}</dd></div>
                </dl>
            </section>

            {booking.status === 'held' && (
                <Link href={`/golf/${booking.courseSlug}`} className="self-start font-medium text-blue-600 hover:underline">{t('backToCourse')}</Link>
            )}

            {cancellation.allowed && (
                <section className="flex flex-col gap-3">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        {cancellation.charged
                            ? t('cancelConfirmedHint', { date: dateTime(booking.freeCancelUntil), total: money(booking.total) })
                            : t('cancelRequestedHint')}
                    </p>
                    <CancelGolfBookingButton reference={booking.reference} />
                </section>
            )}

            {!cancellation.allowed && cancellation.reason === 'free_cancellation_ended' && (
                <section className="flex flex-col gap-3">
                    <p className="text-sm text-slate-600 dark:text-slate-300">{t('cancelEnded', { date: dateTime(booking.freeCancelUntil) })}</p>
                    <div><TeeTimeButton secondary /></div>
                </section>
            )}
        </main>
    );
}
