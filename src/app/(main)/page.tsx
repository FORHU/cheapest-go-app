export const revalidate = 1800; // regenerate every 30 minutes

import { Suspense } from "react";
import { Hero } from "@/components/landing/hero";
import { RecentlyViewed, YourRecentSearches } from "@/components/landing/sections";
import { AppBanner } from "@/components/landing/layout";
import {
  SectionSkeleton,
  DealsSectionStream,
  StaysForEveryStyleStream,
  ExploreVacationPackagesStream,
  ExploreUniqueStaysStream,
  LastMinuteWeekendDealsStream,
} from "./_sections";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between pb-20">
      <Hero />

      <div className="w-full space-y-2 sm:space-y-4">
        <div className="max-w-[1400px] mx-auto w-full">
          {/* Client-side sections — render immediately */}
          <YourRecentSearches />
          <RecentlyViewed />

          {/* Data sections — each streams independently */}
          <Suspense fallback={<SectionSkeleton />}>
            <DealsSectionStream />
          </Suspense>
          <Suspense fallback={<SectionSkeleton />}>
            <StaysForEveryStyleStream />
          </Suspense>
          <Suspense fallback={<SectionSkeleton />}>
            <ExploreVacationPackagesStream />
          </Suspense>
          <Suspense fallback={<SectionSkeleton />}>
            <ExploreUniqueStaysStream />
          </Suspense>
          <Suspense fallback={<SectionSkeleton />}>
            <LastMinuteWeekendDealsStream />
          </Suspense>
        </div>
      </div>

      <AppBanner />
    </main>
  );
}
