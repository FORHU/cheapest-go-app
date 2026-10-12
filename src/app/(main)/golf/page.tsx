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

    const tab = (active: boolean) =>
        `border-b-2 pb-1 text-sm transition-colors ${active
            ? 'border-g-accent font-semibold text-g-ink'
            : 'border-transparent text-g-muted hover:text-g-ink'}`;

    return (
        <div className="mx-auto max-w-6xl px-4 pb-24 pt-12 md:pt-16">
            <header className="grid gap-6 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] md:items-end md:gap-12">
                <h1 className="font-golf text-5xl font-medium leading-[1.02] tracking-tight text-balance text-g-ink md:text-7xl">{t('heading')}</h1>
                <p className="max-w-md text-base leading-relaxed text-pretty text-g-muted md:pb-2">{t('subheading')}</p>
            </header>

            {countries.length > 1 && (
                <nav aria-label={t('filterLabel')} className="mt-10 flex flex-wrap gap-x-6 gap-y-2">
                    <Link href={`/golf${searchQuery({ ...params, country: undefined })}`} className={tab(!params.country)}>{t('allCountries')}</Link>
                    {countries.map(c => (
                        <Link key={c} href={`/golf${searchQuery({ ...params, country: c })}`} className={tab(params.country === c)}>{c}</Link>
                    ))}
                </nav>
            )}

            <GolfSearchForm params={params} />

            {results && results.length > 0 && (
                <>
                    <p className="mt-4 text-xs text-g-muted">{ts('priceNote', { players: params.players })}</p>
                    <div className="mt-2 divide-y divide-g-rule border-b border-g-rule">
                        {results.map(result => <GolfSearchResultCard key={result.course.id} result={result} params={params} />)}
                    </div>
                </>
            )}

            {unlisted.length > 0 && (
                <div className="mt-12 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                    {unlisted.map(course => <GolfCourseCard key={course.id} course={course} />)}
                </div>
            )}

            {(results?.length ?? 0) === 0 && unlisted.length === 0 && (
                <p className="mt-16 max-w-md text-g-muted">{filtered ? ts('empty') : t('empty')}</p>
            )}
        </div>
    );
}
