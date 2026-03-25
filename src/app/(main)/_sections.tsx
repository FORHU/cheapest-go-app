/**
 * Async server component wrappers for streaming landing sections.
 * Each component fetches its own data independently so React can stream
 * each section as soon as its data is ready.
 */
import {
    DealsSection,
    StaysForEveryStyle,
    ExploreVacationPackages,
    ExploreUniqueStays,
    LastMinuteWeekendDeals,
} from "@/components/landing/sections";
import {
    getFlightDeals,
    getWeekendDeals,
    getPopularDestinations,
    getUniqueStays,
    getTravelStyles,
} from "@/lib/server/landing/get-landing-data";

// ─── Section skeleton — generic horizontal-scroll placeholder ────────────────
export function SectionSkeleton() {
    return (
        <div className="w-full py-4 md:py-8 px-4 sm:px-6">
            <div className="max-w-[1400px] mx-auto space-y-4">
                <div className="h-7 w-52 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />
                <div className="h-4 w-72 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                <div className="flex gap-4 overflow-hidden">
                    {[1, 2, 3, 4].map(i => (
                        <div
                            key={i}
                            className="flex-shrink-0 w-[220px] sm:w-[260px] md:w-[320px] aspect-[3/2] bg-slate-200 dark:bg-slate-700 rounded-xl animate-pulse"
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── Individual streaming sections ───────────────────────────────────────────
export async function DealsSectionStream() {
    const deals = await getFlightDeals();
    return <DealsSection deals={deals} />;
}

export async function StaysForEveryStyleStream() {
    const styles = await getTravelStyles();
    return <StaysForEveryStyle styles={styles} />;
}

export async function ExploreVacationPackagesStream() {
    const destinations = await getPopularDestinations();
    return <ExploreVacationPackages destinations={destinations} />;
}

export async function ExploreUniqueStaysStream() {
    const stays = await getUniqueStays();
    return <ExploreUniqueStays stays={stays} />;
}

export async function LastMinuteWeekendDealsStream() {
    const deals = await getWeekendDeals();
    return <LastMinuteWeekendDeals deals={deals} />;
}
