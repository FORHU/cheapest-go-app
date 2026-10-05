import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Check, Flag, MapPin } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { hreflangAlternates } from '@/lib/seo/hreflang';
import { getPublishedCourseBySlug } from '@/lib/server/golf/courses';
import { courseHasSchedules } from '@/lib/server/golf/teeTimes';
import { localDate } from '@/lib/golf/time';
import { formatGreenFee } from '@/components/golf/format';
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

    const [t, locale] = await Promise.all([getTranslations('golf'), getLocale()]);
    const [cover, ...gallery] = course.imageUrls;
    const facts = [t('holes', { holes: course.holes }), course.par ? t('par', { par: course.par }) : null].filter(Boolean);
    const paragraphs = course.description.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

    return (
        <main className="min-h-screen pb-20">
            <div className="relative h-72 w-full overflow-hidden bg-emerald-900 md:h-96">
                {cover ? (
                    <Image src={cover} alt={course.name} fill unoptimized priority className="object-cover" />
                ) : (
                    <Flag className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 text-emerald-700" aria-hidden />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 mx-auto max-w-5xl px-4 pb-8 text-white">
                    <Link href="/golf" className="mb-3 inline-flex items-center gap-1 text-sm text-white/80 hover:text-white">
                        <ChevronLeft className="h-4 w-4" /> {t('backToList')}
                    </Link>
                    <h1 className="text-3xl font-bold drop-shadow md:text-5xl">{course.name}</h1>
                    <p className="mt-2 flex items-center gap-1.5 text-white/85"><MapPin className="h-4 w-4" /> {course.city}, {course.country}</p>
                </div>
            </div>

            <div className="mx-auto grid max-w-5xl gap-10 px-4 pt-8 lg:grid-cols-[1fr_20rem]">
                <div className="min-w-0">
                    {gallery.length > 0 && (
                        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {gallery.map(url => (
                                <div key={url} className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-100">
                                    <Image src={url} alt={course.name} fill unoptimized className="object-cover" />
                                </div>
                            ))}
                        </div>
                    )}

                    {paragraphs.length > 0 && (
                        <section className="mb-8">
                            <h2 className="mb-3 text-xl font-semibold text-slate-900 dark:text-slate-100">{t('aboutHeading')}</h2>
                            <div className="space-y-3 text-slate-600 dark:text-slate-300">
                                {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
                            </div>
                        </section>
                    )}

                    {course.amenities.length > 0 && (
                        <section className="mb-8">
                            <h2 className="mb-3 text-xl font-semibold text-slate-900 dark:text-slate-100">{t('amenitiesHeading')}</h2>
                            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                {course.amenities.map(a => (
                                    <li key={a} className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                                        <Check className="h-4 w-4 text-emerald-600" aria-hidden /> {t(`amenities.${a}`)}
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    {course.address && (
                        <section>
                            <h2 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">{t('addressHeading')}</h2>
                            <p className="text-slate-600 dark:text-slate-300">{course.address}</p>
                        </section>
                    )}
                </div>

                <aside className="h-fit rounded-2xl border border-slate-200 p-5 lg:sticky lg:top-24 dark:border-white/10">
                    <p className="text-sm text-slate-600 dark:text-slate-300">{facts.join(' · ')}</p>
                    {course.greenFeeFrom != null && (
                        <p className="mt-1 text-lg font-semibold text-emerald-700 dark:text-emerald-400">
                            {t('greenFeesFrom', { price: formatGreenFee(course.greenFeeFrom, course.currency, locale) })}
                        </p>
                    )}
                    {sellsTeeTimes ? (
                        <>
                            <div className="my-5 border-t border-slate-200 dark:border-white/10" />
                            <TeeTimePicker slug={course.slug} today={localDate(new Date(), course.timezone!)} />
                            <p className="mb-3 mt-6 text-sm text-slate-500 dark:text-slate-400">{t('booking.orAsk')}</p>
                            <TeeTimeButton secondary />
                        </>
                    ) : (
                        <>
                            <p className="my-4 text-sm text-slate-500 dark:text-slate-400">{t('askTeeTimesHint')}</p>
                            <TeeTimeButton />
                        </>
                    )}
                </aside>
            </div>
        </main>
    );
}
