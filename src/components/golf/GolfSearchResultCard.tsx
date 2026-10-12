import Image from 'next/image';
import Link from 'next/link';
import { Flag } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { CourseSearchResult } from '@/lib/server/golf/search';
import { searchQuery, type GolfSearchParams } from '@/lib/golf/search';
import { formatMoney } from './format';

const chip = 'block rounded-sm border border-g-rule px-3 py-2 text-left transition duration-200 hover:border-g-accent hover:bg-g-sunk';

/**
 * One course in the search results: a ruled row, photograph left, the all-in price set large on
 * the right. Every price is the all-in amount for the party searched for; a course with nothing
 * on the chosen date is quieter and offers the nearest dates that have some.
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
        <article className={`golf-theme grid gap-5 py-7 sm:grid-cols-[15rem_1fr] md:grid-cols-[17rem_1fr_12rem] md:gap-8 ${matches ? '' : 'opacity-80'}`}>
            <Link href={courseHref} aria-label={course.name} tabIndex={-1}
                className="relative aspect-[4/3] w-full overflow-hidden rounded-sm bg-[#e4dfd0] sm:aspect-[5/4] dark:bg-[#1a251f]">
                {course.imageUrls[0] ? (
                    <Image src={course.imageUrls[0]} alt="" fill unoptimized sizes="(min-width: 768px) 17rem, 100vw"
                        className={`object-cover ${matches ? '' : 'grayscale'}`} />
                ) : (
                    <Flag className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 text-g-muted/60" aria-hidden />
                )}
            </Link>

            <div className="flex min-w-0 flex-col gap-3">
                <div>
                    <h2 className="font-golf text-2xl font-medium leading-tight tracking-tight text-g-ink md:text-3xl">
                        <Link href={courseHref} className="underline-offset-4 decoration-g-accent/50 hover:underline">{course.name}</Link>
                    </h2>
                    <p className="mt-1 text-sm text-g-muted">{course.city}, {course.country} · {facts}</p>
                </div>

                {teeTimes.length > 0 && (
                    <ul className="flex flex-wrap gap-2" aria-label={t('booking.pickTime')}>
                        {teeTimes.map(tt => (
                            <li key={tt.id}>
                                <Link href={`/golf/${course.slug}/book?teeTime=${tt.id}&players=${params.players}`} className={chip}>
                                    <span className="block font-mono text-base font-medium tabular-nums text-g-ink">{tt.localTime}</span>
                                    <span className="block text-xs tabular-nums text-g-muted">{ts('eachPrice', { price: money(tt.perPlayer, tt.currency) })}</span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}

                {!matches && params.date && (
                    <div className="text-sm">
                        <p className="text-g-ink">{ts('noTeeTimesOn', { date: day(params.date) })}</p>
                        {nearest.length > 0 && (
                            <>
                                <p className="mt-3 text-xs font-medium text-g-muted">{ts('nearestHeading')}</p>
                                <ul className="mt-1.5 flex flex-wrap gap-2">
                                    {nearest.map(n => (
                                        <li key={n.date}>
                                            <Link href={`/golf${searchQuery({ ...params, date: n.date })}`} className={`${chip} tabular-nums`}>
                                                {ts('nearestDate', { date: day(n.date), price: money(n.perPlayer, n.currency) })}
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </div>
                )}
            </div>

            <div className="flex flex-col gap-1 border-t border-g-rule pt-4 sm:col-span-2 md:col-span-1 md:items-end md:border-l md:border-t-0 md:pl-6 md:pt-0 md:text-right">
                {from && (
                    <>
                        <p className="font-golf text-xl font-medium leading-snug tabular-nums text-balance text-g-ink">
                            {ts('fromPrice', { price: money(from.perPlayer, from.currency) })}
                        </p>
                        <p className="text-xs tabular-nums text-g-muted">
                            {ts('partyTotal', { total: money(from.total, from.currency), players: params.players })}
                        </p>
                    </>
                )}
                <Link href={courseHref} className="mt-auto pt-3 text-sm font-semibold text-g-accent underline-offset-4 hover:underline">{ts('viewCourse')}</Link>
            </div>
        </article>
    );
}
