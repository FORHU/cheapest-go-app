import { HotelResultsClient } from '@/components/search/HotelResultsClient';
import { MapResultsClient } from '@/components/search/MapResultsClient';
import { CountryCityPicker } from '@/components/search/CountryCityPicker';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
    const t = await getTranslations('hotels.searchPage');
    return {
        title: t('title'),
        description: t('description'),
        robots: { index: false, follow: false },
        alternates: { canonical: '/search' },
    };
}

export default async function SearchPage(props: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const searchParams = await props.searchParams;

    const flatParams = Object.fromEntries(
        Object.entries(searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] ?? '' : v ?? ''])
    ) as Record<string, string>;

    const dest = flatParams.destination || '';
    const viewMode = flatParams.view || 'map';

    // ─── MAP VIEW ───────────────────────────────────────────────────
    if (viewMode === 'map') {
        return (
            <main className="h-[calc(100dvh-64px)] w-full overflow-hidden flex flex-col">
                {flatParams.destinationType === 'country' && (
                    <div className="shrink-0 px-3 pt-2">
                        <CountryCityPicker searchParams={flatParams} />
                    </div>
                )}
                <div className="flex-1 overflow-hidden">
                    <MapResultsClient searchParams={flatParams} destination={dest} />
                </div>
            </main>
        );
    }

    // ─── LIST VIEW ──────────────────────────────────────────────────
    return (
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
            <HotelResultsClient
                searchParams={flatParams}
            />
        </div>
    );
}
