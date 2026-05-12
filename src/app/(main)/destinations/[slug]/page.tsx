import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@supabase/supabase-js';
import { buildDestinationSlug } from '@/lib/utils';
import { env } from '@/utils/env';

export const revalidate = 3600;

interface PopularDestination {
    id: string;
    city: string;
    country: string;
    image_url: string | null;
    average_price: number | null;
}

async function getDestination(slug: string): Promise<PopularDestination | null> {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
    const { data } = await supabase.from('popular_destinations').select('*');
    if (!data) return null;
    return (data as PopularDestination[]).find(
        d => buildDestinationSlug(d.city, d.country) === slug || buildDestinationSlug(d.city) === slug
    ) ?? null;
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string }>;
}): Promise<Metadata> {
    const { slug } = await params;
    const dest = await getDestination(slug);
    if (!dest) return {};

    const title = `Hotels in ${dest.city}, ${dest.country} – Cheapest Rates | CheapestGo`;
    const description = `Find and book the cheapest hotels in ${dest.city}, ${dest.country}. Compare prices and get the best deals on CheapestGo.`;

    return {
        title,
        description,
        alternates: { canonical: `/destinations/${slug}` },
        openGraph: {
            title,
            description,
            type: 'website',
            images: dest.image_url ? [{ url: dest.image_url, width: 1200, height: 630, alt: dest.city }] : [],
        },
    };
}

export default async function DestinationPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const dest = await getDestination(slug);
    if (!dest) notFound();

    const searchUrl = `/hotels/search?destination=${encodeURIComponent(`${dest.city}, ${dest.country}`)}`;

    return (
        <main className="min-h-screen pb-20">
            {/* Hero */}
            <div className="relative h-72 md:h-96 w-full overflow-hidden">
                {dest.image_url ? (
                    <Image
                        src={dest.image_url}
                        alt={dest.city}
                        fill
                        className="object-cover"
                        priority
                    />
                ) : (
                    <div className="absolute inset-0 bg-liniear-to-br from-blue-600 to-indigo-800" />
                )}
                <div className="absolute inset-0 bg-black/40" />
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-center px-4">
                    <h1 className="text-4xl md:text-5xl font-bold drop-shadow-lg">{dest.city}</h1>
                    <p className="text-lg md:text-xl mt-2 text-white/80">{dest.country}</p>
                    {dest.average_price && (
                        <p className="mt-3 text-sm text-white/70">
                            Hotels from <span className="font-semibold text-white">${dest.average_price.toFixed(0)}</span> / night
                        </p>
                    )}
                </div>
            </div>

            {/* CTA */}
            <div className="max-w-3xl mx-auto px-4 py-12 text-center">
                <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100 mb-3">
                    Find hotels in {dest.city}
                </h2>
                <p className="text-slate-500 dark:text-slate-400 mb-8">
                    Browse the cheapest available hotels in {dest.city}, {dest.country} and book with confidence.
                </p>
                <Link
                    href={searchUrl}
                    className="inline-flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors shadow-md"
                >
                    Search Hotels in {dest.city}
                </Link>
            </div>
        </main>
    );
}
