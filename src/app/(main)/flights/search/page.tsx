import { FlightResults } from "@/components/flights/flightResults";
import { saveSearch, searchFlights } from "@/lib/server/flights/search-flights";
import { FlightSearchParams, CabinClass, FlightOffer } from "@/types/flights";
import { Suspense } from "react";
import { SectionHeader } from "@/components/ui";

/**
 * SearchPage - Server Component that orchestrates the flight search flow.
 */
export default async function SearchPage({
    searchParams,
}: {
    searchParams: { [key: string]: string | string[] | undefined };
}) {
    // 1. Extract params from URL
    const params: FlightSearchParams = {
        origin: (searchParams.origin as string) || "",
        destination: (searchParams.destination as string) || "",
        departureDate: (searchParams.departure as string) || "",
        returnDate: (searchParams.return as string) || undefined,
        adults: parseInt(searchParams.adults as string) || 1,
        children: parseInt(searchParams.children as string) || 0,
        infants: parseInt(searchParams.infants as string) || 0,
        cabinClass: (searchParams.cabin as CabinClass) || "economy",
    };

    // Validation
    if (!params.origin || !params.destination || !params.departureDate) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center space-y-4">
                    <h1 className="text-2xl font-bold">Invalid Search Parameters</h1>
                    <p className="text-gray-500">Please provide origin, destination and departure date.</p>
                    <a href="/landing" className="text-blue-600 hover:underline">Return to search</a>
                </div>
            </div>
        );
    }

    return (
        <main className="min-h-screen bg-slate-50 py-12 px-4 md:py-20">
            <div className="max-w-7xl mx-auto space-y-12">
                <SectionHeader 
                    title={`${params.origin} to ${params.destination}`}
                    subtitle={`${params.departureDate} • ${params.adults} Adults • ${params.cabinClass.replace('_', ' ')}`}
                />

                <Suspense fallback={<SearchLoader />}>
                    <SearchResultsOrchestrator params={params} />
                </Suspense>
            </div>
        </main>
    );
}

/**
 * SearchResultsOrchestrator - Handles the actual data fetching and orchestration.
 */
async function SearchResultsOrchestrator({ params }: { params: FlightSearchParams }) {
    try {
        // 1. Save search to DB (for history and context)
        const savedSearch = await saveSearch(params);
        
        // 2. Perform search (Parallel provider fetch + Cache update)
        const results = await searchFlights({ ...params, searchId: savedSearch.id });
        
        const offers: FlightOffer[] = results;

        return <FlightResults offers={offers} loading={false} />;
    } catch (error: any) {
        return (
            <div className="bg-red-50 p-6 rounded-2xl border border-red-100 text-red-600">
                <p className="font-bold">Search Error</p>
                <p className="text-sm">{error.message}</p>
                <a href="/landing" className="block mt-4 text-xs font-bold uppercase tracking-widest text-red-700 hover:underline">
                    Try another search
                </a>
            </div>
        );
    }
}

/**
 * Loading Placeholder
 */
function SearchLoader() {
    return (
        <div className="space-y-4 animate-pulse">
            {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-slate-200 rounded-xl" />
            ))}
        </div>
    );
}
