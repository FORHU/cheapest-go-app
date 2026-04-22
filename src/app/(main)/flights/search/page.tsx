import type { Metadata } from 'next';
import Link from "next/link";
import { Suspense } from 'react';
import { SearchFetcher } from "@/components/flights/search-fetcher";
import { SectionHeader } from "@/components/ui";
import BackButton from "@/components/common/BackButton";
import PriceCalendar from "@/components/flights/PriceCalendar";
import PriceAlertButton from "@/components/flights/PriceAlertButton";
import { Hotel, Sparkles } from "lucide-react";
import type { CabinClass } from "@/types/flights";

export const dynamic = 'force-dynamic';

export async function generateMetadata({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
    const sp = await searchParams;
    const origin = (sp.origin as string) || (sp.origin0 as string) || '';
    const destination = (sp.destination as string) || (sp.dest0 as string) || '';

    const title = origin && destination
        ? `Flights ${origin} → ${destination} | CheapestGo`
        : 'Flight Search Results | CheapestGo';

    const description = origin && destination
        ? `Compare and book the cheapest flights from ${origin} to ${destination}. Find the best deals on CheapestGo.`
        : 'Compare and book cheap flights worldwide. Find the best deals on CheapestGo.';

    return {
        title,
        description,
        robots: { index: false, follow: false },
        alternates: { canonical: '/flights/search' },
    };
}

/**
 * SearchPage — Server Component (fast shell).
 *
 * Renders immediately with a skeleton loading state.
 * The actual API call happens client-side in <SearchFetcher>
 * so the user sees the page within ~1s instead of 80+ seconds.
 */
export default async function SearchPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    // Await searchParams (required in Next.js 15+)
    const sp = await searchParams;

    // Accept both URL formats:
    //   Simple form:   ?origin=BKK&destination=SIN&departure=2026-04-10
    //   Landing search: ?origin0=BKK&dest0=SIN&date0=2026-04-10T...
    const origin = (sp.origin as string) || (sp.origin0 as string) || "";
    const destination = (sp.destination as string) || (sp.dest0 as string) || "";
    const departure = (sp.departure as string)
        || ((sp.date0 as string)?.slice(0, 10)) // ISO string → YYYY-MM-DD
        || "";
    const returnDate = (sp.return as string)
        || ((sp.date1 as string)?.slice(0, 10))
        || undefined;
    const adults = Math.max(1, parseInt(sp.adults as string) || 1);
    const children = Math.max(0, parseInt(sp.children as string) || 0);
    const infants = Math.max(0, parseInt(sp.infants as string) || 0);
    const cabinClass = (sp.cabin as CabinClass) || "economy";
    const bundleHotelId = sp.bundleHotelId as string | undefined;

    // Guard: redirect gracefully when required params are missing
    if (!origin || !destination || !departure) {
        // Arrived from hotel bundle upsell — guide user to fill in origin/destination
        if (bundleHotelId) {
            const homeParams = new URLSearchParams();
            homeParams.set('mode', 'flights');
            homeParams.set('bundleHotelId', bundleHotelId);
            if (departure) homeParams.set('departure', departure);
            return (
                <div className="min-h-screen flex items-center justify-center">
                    <div className="text-center space-y-4 max-w-sm px-6">
                        <div className="w-14 h-14 mx-auto bg-violet-100 dark:bg-violet-900/30 rounded-full flex items-center justify-center">
                            <Hotel size={24} className="text-violet-600 dark:text-violet-400" />
                        </div>
                        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Where are you flying from?</h1>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">
                            Your hotel is booked. Search for a flight to complete your bundle and save up to 8%.
                        </p>
                        <Link
                            href={`/?${homeParams.toString()}`}
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-full transition-colors"
                        >
                            <Sparkles size={14} />
                            Search flights
                        </Link>
                    </div>
                </div>
            );
        }
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center space-y-4">
                    <h1 className="text-2xl font-bold">Invalid Search Parameters</h1>
                    <p className="text-gray-500">Please provide origin, destination and departure date.</p>
                    <Link href="/" className="text-blue-600 hover:underline">
                        Return to search
                    </Link>
                </div>
            </div>
        );
    }

    const cabinLabel = cabinClass.replace('_', ' ');
    const subtitle = [departure, returnDate && `↩ ${returnDate}`, `${adults} Adult${adults > 1 ? 's' : ''}`, cabinLabel]
        .filter(Boolean)
        .join(' · ');

    return (
        <main className="min-h-screen pt-4 pb-12 px-4 md:pt-6 md:pb-20 overflow-x-hidden">
            <div className="max-w-7xl mx-auto space-y-6">
                <div>
                    <BackButton href="/" bareIcon className="mb-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur border border-slate-200/50 dark:border-slate-700/50 text-slate-700 dark:text-slate-300 w-8 h-8 lg:w-10 lg:h-10 rounded-full flex items-center justify-center shadow-sm p-0!" />
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <SectionHeader
                            title={`${origin} → ${destination}`}
                            subtitle={subtitle}
                        />
                        <Suspense fallback={null}>
                            <PriceAlertButton
                                origin={origin}
                                destination={destination}
                                adults={adults}
                                cabin={cabinClass}
                            />
                        </Suspense>
                    </div>

                    {/* Bundle context banner — shown when user arrived from hotel booking success */}
                    {bundleHotelId && (
                        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700/50">
                            <div className="p-1.5 bg-violet-100 dark:bg-violet-900/40 rounded-lg shrink-0">
                                <Hotel size={14} className="text-violet-600 dark:text-violet-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-violet-700 dark:text-violet-300 flex items-center gap-1">
                                    <Sparkles size={11} />
                                    Flight + Hotel Bundle Active
                                </p>
                                <p className="text-[11px] text-violet-600/80 dark:text-violet-400/80">
                                    Select a flight below — your bundle discount will be applied at checkout.
                                </p>
                            </div>
                            <span className="shrink-0 px-2 py-0.5 text-[10px] font-bold bg-amber-400 text-amber-900 rounded-full">
                                Save up to 8%
                            </span>
                        </div>
                    )}
                </div>

                {/* Price calendar — compact collapsible strip */}
                <Suspense fallback={null}>
                    <PriceCalendar
                        origin={origin}
                        destination={destination}
                        adults={adults}
                        cabin={cabinClass}
                        initialDate={departure}
                    />
                </Suspense>

                {/*
                  * SearchFetcher is a client component.
                  * It fires the POST /api/flights/search request AFTER this
                  * page HTML reaches the browser, so the user sees the
                  * skeleton loading state within ~1 second.
                  */}
                <SearchFetcher
                    origin={origin}
                    destination={destination}
                    departureDate={departure}
                    returnDate={returnDate}
                    adults={adults}
                    children={children}
                    infants={infants}
                    cabinClass={cabinClass}
                />
            </div>
        </main>
    );
}
