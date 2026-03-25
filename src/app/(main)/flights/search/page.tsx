import Link from "next/link";
import { SearchFetcher } from "@/components/flights/search-fetcher";
import { SectionHeader } from "@/components/ui";
import type { CabinClass } from "@/types/flights";

export const dynamic = 'force-dynamic';

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

    // Guard: redirect gracefully when required params are missing
    if (!origin || !destination || !departure) {
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
        <main className="min-h-screen py-12 px-4 md:py-20">
            <div className="max-w-7xl mx-auto space-y-12">
                <SectionHeader
                    title={`${origin} → ${destination}`}
                    subtitle={subtitle}
                />

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
