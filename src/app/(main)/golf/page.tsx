import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { hreflangAlternates } from '@/lib/seo/hreflang';
import { listPublishedCountries, listPublishedCourses } from '@/lib/server/golf/courses';
import { searchCourses } from '@/lib/server/golf/search';
import { parseSearchParams, searchQuery } from '@/lib/golf/search';
import { GolfCourseCard } from '@/components/golf/GolfCourseCard';
import { GolfSearchForm } from '@/components/golf/GolfSearchForm';
import { GolfSearchResultCard } from '@/components/golf/GolfSearchResultCard';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('golf');
    return {
        title: t('metaTitle'),
        description: t('metaDescription'),
        alternates: await hreflangAlternates('/golf'),
    };
}

export default async function GolfPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const params = parseSearchParams(await searchParams);
    const t = await getTranslations('golf');
    const ts = await getTranslations('golf.search');
    const filtered = Boolean(params.date || params.from || params.to);

    const [countries, results] = await Promise.all([
        listPublishedCountries(),
        // A search that cannot be priced (an exchange rate is down) degrades to the plain list.
        searchCourses(params).catch(() => null),
    ]);
    // Without a date or time filter every published course stays on the page, bookable now or not.
    const unlisted = !filtered
        ? (await listPublishedCourses({ country: params.country })).filter(c => !results?.some(r => r.course.id === c.id))
        : [];

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
                    <Link href={`/golf${searchQuery({ ...params, country: undefined })}`} className={pill(!params.country)}>{t('allCountries')}</Link>
                    {countries.map(c => (
                        <Link key={c} href={`/golf${searchQuery({ ...params, country: c })}`} className={pill(params.country === c)}>{c}</Link>
                    ))}
                </nav>
            )}

            <GolfSearchForm params={params} />

            {results && results.length > 0 && (
                <>
                    <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">{ts('priceNote', { players: params.players })}</p>
                    <div className="mt-4 flex flex-col gap-5">
                        {results.map(result => <GolfSearchResultCard key={result.course.id} result={result} params={params} />)}
                    </div>
                </>
            )}

            {unlisted.length > 0 && (
                <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {unlisted.map(course => <GolfCourseCard key={course.id} course={course} />)}
                </div>
            )}

            {(results?.length ?? 0) === 0 && unlisted.length === 0 && (
                <p className="mt-12 text-center text-slate-500 dark:text-slate-400">{filtered ? ts('empty') : t('empty')}</p>
            )}
        </main>
    );
}
