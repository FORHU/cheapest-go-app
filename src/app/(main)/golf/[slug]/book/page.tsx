import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { getBookableTeeTime } from '@/lib/server/golf/teeTimes';
import { golfServiceFee } from '@/lib/pricing';
import { convertCurrencyStrict, refreshExchangeRates } from '@/lib/currency';
import { freeCancelUntil } from '@/lib/golf/rules';
import { formatMoney } from '@/components/golf/format';
import { BookTeeTimeClient } from './BookTeeTimeClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

type Props = {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

/** Checkout for one tee time. Prices here are the same function of the same numbers the hold charges. */
export default async function BookTeeTimePage({ params, searchParams }: Props) {
    const { slug } = await params;
    const query = await searchParams;
    const teeTimeId = typeof query.teeTime === 'string' ? query.teeTime : '';
    const players = Math.min(4, Math.max(1, Number.parseInt(typeof query.players === 'string' ? query.players : '', 10) || 2));

    const { user } = await getAuthenticatedUser();
    if (!user) {
        redirect(`/login?next=${encodeURIComponent(`/golf/${slug}/book?teeTime=${encodeURIComponent(teeTimeId)}&players=${players}`)}`);
    }

    const [t, locale, bookable] = await Promise.all([
        getTranslations('golf.booking'), getLocale(), getBookableTeeTime(teeTimeId),
    ]);
    if (!bookable || bookable.course.slug !== slug) {
        return (
            <main className="mx-auto max-w-xl px-4 py-20 text-center">
                <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{t('unavailable')}</h1>
                <Link href={`/golf/${slug}`} className="mt-6 inline-block font-medium text-blue-600 hover:underline">{t('backToCourse')}</Link>
            </main>
        );
    }

    const { teeTime, course } = bookable;
    const startsAt = new Date(teeTime.startsAt);
    const greenFee = Math.round(teeTime.pricePerPlayer * players * 100) / 100;
    if (teeTime.currency !== 'USD') await refreshExchangeRates();
    const fee = golfServiceFee(greenFee, teeTime.currency, convertCurrencyStrict);
    const total = Math.round(fee.chargedTotal * 100) / 100;
    const money = (amount: number) => formatMoney(amount, teeTime.currency, locale);
    const courseClock = (options: Intl.DateTimeFormatOptions, instant: Date) =>
        new Intl.DateTimeFormat(locale, { timeZone: course.timezone, ...options }).format(instant);
    // A tee time inside the course's free-cancellation window was never freely cancellable:
    // say so, rather than show a cutoff that is already behind us.
    const cutoff = freeCancelUntil(startsAt, course.freeCancelHours);
    const freeCancel = cutoff.getTime() > Date.now()
        ? t('freeCancel', { date: courseClock({ dateStyle: 'medium', timeStyle: 'short' }, cutoff) })
        : t('noFreeCancel');

    return (
        <BookTeeTimeClient
            teeTimeId={teeTime.id}
            players={players}
            summary={{
                courseName: course.name,
                courseHref: `/golf/${course.slug}`,
                date: courseClock({ dateStyle: 'full' }, startsAt),
                time: t('courseTime', { time: teeTime.localTime }),
                greenFeeLabel: t('greenFee', { players, price: money(teeTime.pricePerPlayer) }),
                greenFee: money(greenFee),
                serviceFee: money(Math.round((total - greenFee) * 100) / 100),
                total: money(total),
                freeCancel,
            }}
        />
    );
}
