import Image from 'next/image';
import Link from 'next/link';
import { Flag } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { CourseSearchResult } from '@/lib/server/golf/search';
import { searchQuery, type GolfSearchParams } from '@/lib/golf/search';
import { formatMoney } from './format';

/**
 * One course in the search results. Every price is the all-in amount for the party searched for;
 * a course with nothing on the chosen date is dimmed and offers the nearest dates that have some.
 */
export function GolfSearchResultCard({ result, params }: { result: CourseSearchResult; params: GolfSearchParams }) {
    const t = useTranslations('golf');
    const ts = useTranslations('golf.search');
    const locale = useLocale();
    const { course, from, teeTimes, nearest, matches } = result;
    const money = (amount: number, currency: string) => formatMoney(amount, currency, locale);
    const day = (date: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
    const facts = [t('holes', { holes: course.holes }), course.par ? t('par', { par: course.par }) : null].filter(Boolean).join(' · ');
    const courseHref = `/golf/${course.slug}`;

    return (
        <article className={`flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white sm:flex-row dark:border-white/10 dark:bg-slate-900 ${matches ? '' : 'opacity-75'}`}>
            <Link href={courseHref} className="relative aspect-[4/3] w-full shrink-0 bg-emerald-50 sm:w-64 dark:bg-emerald-950/30" aria-label={course.name} tabIndex={-1}>
                {course.imageUrls[0] ? (
                    <Image src={course.imageUrls[0]} alt="" fill unoptimized sizes="(min-width: 640px) 16rem, 100vw" className="object-cover" />
                ) : (
                    <Flag className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 text-emerald-300" aria-hidden />
                )}
            </Link>
            <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
                <div>
                    <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                        <Link href={courseHref} className="hover:underline">{course.name}</Link>
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{course.city}, {course.country} · {facts}</p>
                </div>

                {from && (
                    <div>
                        <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">
                            {ts('fromPrice', { price: money(from.perPlayer, from.currency) })}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            {ts('partyTotal', { total: money(from.total, from.currency), players: params.players })}
                        </p>
                    </div>
                )}

                {teeTimes.length > 0 && (
                    <ul className="flex flex-wrap gap-2" aria-label={t('booking.pickTime')}>
                        {teeTimes.map(tt => (
                            <li key={tt.id}>
                                <Link href={`/golf/${course.slug}/book?teeTime=${tt.id}&players=${params.players}`}
                                    className="block rounded-lg border border-slate-200 px-2.5 py-1.5 text-left hover:border-blue-400 dark:border-white/10">
                                    <span className="block font-semibold tabular-nums text-slate-900 dark:text-slate-100">{tt.localTime}</span>
                                    <span className="block text-xs text-slate-500 dark:text-slate-400">{ts('eachPrice', { price: money(tt.perPlayer, tt.currency) })}</span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}

                {!matches && params.date && (
                    <div className="text-sm">
                        <p className="text-slate-600 dark:text-slate-300">{ts('noTeeTimesOn', { date: day(params.date) })}</p>
                        {nearest.length > 0 && (
                            <>
                                <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{ts('nearestHeading')}</p>
                                <ul className="mt-1 flex flex-wrap gap-2">
                                    {nearest.map(n => (
                                        <li key={n.date}>
                                            <Link href={`/golf${searchQuery({ ...params, date: n.date })}`}
                                                className="block rounded-lg border border-slate-200 px-2.5 py-1.5 hover:border-blue-400 dark:border-white/10">
                                                {ts('nearestDate', { date: day(n.date), price: money(n.perPlayer, n.currency) })}
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </div>
                )}

                <Link href={courseHref} className="mt-auto self-start pt-1 text-sm font-medium text-blue-600 hover:underline">{ts('viewCourse')}</Link>
            </div>
        </article>
    );
}
