import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { getBookableTeeTime } from '@/lib/server/golf/teeTimes';
import { listCourseExtras } from '@/lib/server/golf/extras';
import { golfServiceFee } from '@/lib/pricing';
import { convertCurrencyStrict, refreshExchangeRates } from '@/lib/currency';
import { freeCancelUntil } from '@/lib/golf/rules';
import { formatExtrasParam, parseExtrasParam, priceExtras, sanitizeExtras, type GolfExtraCode } from '@/lib/golf/extras';
import { formatMoney } from '@/components/golf/format';
import { BookTeeTimeClient } from './BookTeeTimeClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

type Props = {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Checkout for one tee time. Every figure here is the same function of the same numbers the hold
 * charges; choosing an extra changes the URL and this page prices it again.
 */
export default async function BookTeeTimePage({ params, searchParams }: Props) {
    const { slug } = await params;
    const query = await searchParams;
    const teeTimeId = typeof query.teeTime === 'string' ? query.teeTime : '';
    const players = Math.min(4, Math.max(1, Number.parseInt(typeof query.players === 'string' ? query.players : '', 10) || 2));
    const asked = parseExtrasParam(typeof query.extras === 'string' ? query.extras : undefined);

    const { user } = await getAuthenticatedUser();
    if (!user) {
        const extras = formatExtrasParam(asked);
        const back = `/golf/${slug}/book?teeTime=${encodeURIComponent(teeTimeId)}&players=${players}${extras ? `&extras=${extras}` : ''}`;
        redirect(`/login?next=${encodeURIComponent(back)}`);
    }

    const [t, tGolf, locale, bookable] = await Promise.all([
        getTranslations('golf.booking'), getTranslations('golf'), getLocale(), getBookableTeeTime(teeTimeId),
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
    const offers = await listCourseExtras(course.id);
    const chosen = sanitizeExtras(asked, offers, players);
    const priced = priceExtras(chosen, offers, players);
    const lines = priced.ok ? priced.lines : [];
    const extrasTotal = priced.ok ? priced.total : 0;

    const startsAt = new Date(teeTime.startsAt);
    const greenFee = round2(teeTime.pricePerPlayer * players);
    const base = round2(greenFee + extrasTotal);
    if (teeTime.currency !== 'USD') await refreshExchangeRates();
    const fee = golfServiceFee(base, teeTime.currency, convertCurrencyStrict);
    const total = round2(fee.chargedTotal);
    const money = (amount: number) => formatMoney(amount, teeTime.currency, locale);
    const extraName = (code: GolfExtraCode) => tGolf(`amenities.${code}`);
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
            bookPath={`/golf/${course.slug}/book`}
            extras={offers.map(offer => ({
                code: offer.code,
                name: extraName(offer.code),
                each: t('extraEach', { price: money(offer.price) }),
                quantity: chosen.find(c => c.code === offer.code)?.quantity ?? 0,
            }))}
            summary={{
                courseName: course.name,
                courseHref: `/golf/${course.slug}`,
                date: courseClock({ dateStyle: 'full' }, startsAt),
                time: t('courseTime', { time: teeTime.localTime }),
                greenFeeLabel: t('greenFee', { players, price: money(teeTime.pricePerPlayer) }),
                greenFee: money(greenFee),
                extraLines: lines.map(line => ({
                    label: t('extraLine', { name: extraName(line.code), count: line.quantity }),
                    amount: money(line.total),
                })),
                serviceFee: money(round2(total - base)),
                total: money(total),
                freeCancel,
            }}
        />
    );
}
