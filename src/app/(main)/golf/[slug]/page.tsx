import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Flag, MapPin } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { hreflangAlternates } from '@/lib/seo/hreflang';
import { getPublishedCourseBySlug } from '@/lib/server/golf/courses';
import { courseHasSchedules } from '@/lib/server/golf/teeTimes';
import { searchCourses } from '@/lib/server/golf/search';
import { DEFAULT_PLAYERS } from '@/lib/golf/search';
import { localDate } from '@/lib/golf/time';
import { formatGreenFee, formatMoney } from '@/components/golf/format';
import { GolfFactBlock } from '@/components/golf/GolfFactBlock';
import { GolfPolicyBlock } from '@/components/golf/GolfPolicyBlock';
import { TeeTimeButton } from '@/components/golf/TeeTimeButton';
import { TeeTimePicker } from '@/components/golf/TeeTimePicker';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
    const { slug } = await params;
    const course = await getPublishedCourseBySlug(slug);
    if (!course) return {};
    const t = await getTranslations('golf');
    const title = t('courseTitle', { name: course.name, city: course.city, country: course.country });
    const description = course.description.slice(0, 160) || t('metaDescription');
    return {
        title,
        description,
        alternates: await hreflangAlternates(`/golf/${slug}`),
        openGraph: {
            title, description, type: 'website',
            images: course.imageUrls[0] ? [{ url: course.imageUrls[0], alt: course.name }] : [],
        },
    };
}

export default async function GolfCoursePage({ params }: Params) {
    const { slug } = await params;
    // Drafts come back null here, so they 404 like a course that does not exist.
    const course = await getPublishedCourseBySlug(slug);
    if (!course) notFound();
    const sellsTeeTimes = course.timezone ? await courseHasSchedules(course.id) : false;
    // The all-in price comes from the quote checkout uses; a course with nothing bookable has none.
    const [soonest] = sellsTeeTimes
        ? await searchCourses({ courseId: course.id, players: DEFAULT_PLAYERS }).catch(() => [])
        : [];

    const [t, locale] = await Promise.all([getTranslations('golf'), getLocale()]);
    const [cover, ...gallery] = course.imageUrls;
    const paragraphs = course.description.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    const heading = 'font-golf text-2xl font-medium tracking-tight text-g-ink';

    return (
        <div className="mx-auto max-w-6xl px-4 pb-24 pt-8">
            <Link href="/golf" className="inline-flex items-center gap-1 text-sm text-g-muted underline-offset-4 hover:text-g-ink hover:underline">
                <ChevronLeft className="h-4 w-4" aria-hidden /> {t('backToList')}
            </Link>

            <header className="mt-6 max-w-4xl">
                <h1 className="font-golf text-5xl font-medium leading-[1.02] tracking-tight text-balance text-g-ink md:text-7xl">{course.name}</h1>
                <p className="mt-4 flex items-center gap-1.5 text-g-muted"><MapPin className="h-4 w-4" aria-hidden /> {course.city}, {course.country}</p>
            </header>

            <div className={`relative mt-8 w-full overflow-hidden rounded-sm bg-[#e4dfd0] dark:bg-[#1a251f] ${cover ? 'aspect-[16/8]' : 'aspect-[16/4]'}`}>
                {cover ? (
                    <Image src={cover} alt={course.name} fill unoptimized priority sizes="(min-width: 1152px) 1152px, 100vw" className="object-cover" />
                ) : (
                    <Flag className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 text-g-muted/50" aria-hidden />
                )}
            </div>

            <div className="mt-12 grid gap-14 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-16">
                <div className="min-w-0">
                    <section className="mb-12" aria-labelledby="golf-facts-heading">
                        <h2 id="golf-facts-heading" className="sr-only">{t('facts.heading')}</h2>
                        <GolfFactBlock course={course} />
                    </section>

                    {paragraphs.length > 0 && (
                        <section className="mb-12 max-w-[65ch]">
                            <h2 className={`${heading} mb-4`}>{t('aboutHeading')}</h2>
                            <div className="space-y-4 text-lg leading-relaxed text-pretty text-g-ink/85">
                                {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
                            </div>
                        </section>
                    )}

                    {gallery.length > 0 && (
                        <div className="mb-12 grid grid-cols-6 gap-3">
                            {gallery.map((url, i) => (
                                <div key={url}
                                    className={`relative overflow-hidden rounded-sm bg-g-sunk ${i % 3 === 0 ? 'col-span-6 aspect-[16/7] sm:col-span-4 sm:aspect-[4/3]' : 'col-span-3 aspect-[4/3] sm:col-span-2 sm:aspect-[3/4]'}`}>
                                    <Image src={url} alt={course.name} fill unoptimized className="object-cover" />
                                </div>
                            ))}
                        </div>
                    )}

                    {course.amenities.length > 0 && (
                        <section className="mb-12">
                            <h2 className={`${heading} mb-4`}>{t('amenitiesHeading')}</h2>
                            <ul className="grid grid-cols-1 border-t border-g-rule sm:grid-cols-2 sm:gap-x-10">
                                {course.amenities.map(a => (
                                    <li key={a} className="border-b border-g-rule py-2.5 text-g-ink">{t(`amenities.${a}`)}</li>
                                ))}
                            </ul>
                        </section>
                    )}

                    {course.address && (
                        <section>
                            <h2 className={`${heading} mb-2`}>{t('addressHeading')}</h2>
                            <p className="text-g-muted">{course.address}</p>
                        </section>
                    )}
                </div>

                <aside className="h-fit border-t-4 border-g-accent bg-g-surface p-6 lg:sticky lg:top-24">
                    {soonest?.from ? (
                        <>
                            <p className="font-golf text-2xl font-medium leading-snug tabular-nums text-balance text-g-ink">
                                {t('search.fromPrice', { price: formatMoney(soonest.from.perPlayer, soonest.from.currency, locale) })}
                            </p>
                            <p className="mt-1 text-xs text-g-muted">
                                {t('search.priceNote', { players: DEFAULT_PLAYERS })}
                            </p>
                        </>
                    ) : course.greenFeeFrom != null && (
                        <p className="font-golf text-2xl font-medium tabular-nums text-g-ink">
                            {t('greenFeesFrom', { price: formatGreenFee(course.greenFeeFrom, course.currency, locale) })}
                        </p>
                    )}
                    {sellsTeeTimes ? (
                        <>
                            <div className="my-6 border-t border-g-rule" />
                            <TeeTimePicker slug={course.slug} today={localDate(new Date(), course.timezone!)} windowDays={course.bookingWindowDays} />
                            <div className="mt-8">
                                <GolfPolicyBlock windowDays={course.bookingWindowDays}
                                    cancel={{ kind: 'hours', hours: course.freeCancelHours }} weatherPolicy={course.weatherPolicy} />
                            </div>
                            <p className="mb-3 mt-8 text-sm text-g-muted">{t('booking.orAsk')}</p>
                            <TeeTimeButton secondary />
                        </>
                    ) : (
                        <>
                            <p className="my-5 text-sm leading-relaxed text-g-muted">{t('askTeeTimesHint')}</p>
                            <TeeTimeButton />
                        </>
                    )}
                </aside>
            </div>
        </div>
    );
}
