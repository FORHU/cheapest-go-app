import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { hreflangAlternates } from '@/lib/seo/hreflang';
import { listPublishedCountries, listPublishedCourses } from '@/lib/server/golf/courses';
import { GolfCourseCard } from '@/components/golf/GolfCourseCard';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('golf');
    return {
        title: t('metaTitle'),
        description: t('metaDescription'),
        alternates: await hreflangAlternates('/golf'),
    };
}

export default async function GolfPage({ searchParams }: { searchParams: Promise<{ country?: string }> }) {
    const { country } = await searchParams;
    const t = await getTranslations('golf');
    const [countries, courses] = await Promise.all([
        listPublishedCountries(),
        listPublishedCourses({ country: country || undefined }),
    ]);

    const pill = (active: boolean) =>
        `rounded-full border px-3 py-1 text-sm transition ${active
            ? 'border-blue-600 bg-blue-600 text-white'
            : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-white/10 dark:text-slate-300'}`;

    return (
        <main className="mx-auto min-h-screen max-w-6xl px-4 pb-20 pt-10">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">{t('heading')}</h1>
            <p className="mt-2 max-w-2xl text-slate-500 dark:text-slate-400">{t('subheading')}</p>

            {countries.length > 1 && (
                <nav aria-label={t('filterLabel')} className="mt-6 flex flex-wrap gap-2">
                    <Link href="/golf" className={pill(!country)}>{t('allCountries')}</Link>
                    {countries.map(c => (
                        <Link key={c} href={`/golf?country=${encodeURIComponent(c)}`} className={pill(country === c)}>{c}</Link>
                    ))}
                </nav>
            )}

            {courses.length === 0 ? (
                <p className="mt-12 text-center text-slate-500 dark:text-slate-400">{t('empty')}</p>
            ) : (
                <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {courses.map(course => <GolfCourseCard key={course.id} course={course} />)}
                </div>
            )}
        </main>
    );
}
