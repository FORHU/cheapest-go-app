import { Hero } from "@/components/landing/hero";
import { 
  RecentlyViewed, 
  YourRecentSearches, 
  DealsSection, 
  StaysForEveryStyle, 
  ExploreVacationPackages, 
  ExploreUniqueStays, 
  LastMinuteWeekendDeals 
} from "@/components/landing/sections";
import { AppBanner } from "@/components/landing/layout";
import { getLandingData } from "@/lib/server/landing/get-landing-data";

export default async function Home() {
  const { 
    flightDeals, 
    weekendDeals, 
    popularDestinations,
    uniqueStays,
    travelStyles
  } = await getLandingData();

  return (
    <main className="flex min-h-screen flex-col items-center justify-between pb-20">
      <Hero />
      
      <div className="w-full space-y-2 sm:space-y-4">
        <div className="max-w-[1400px] mx-auto w-full">
          <YourRecentSearches />
          <RecentlyViewed />
          <DealsSection deals={flightDeals} />
          <StaysForEveryStyle styles={travelStyles} />
          <ExploreVacationPackages destinations={popularDestinations} />
          <ExploreUniqueStays stays={uniqueStays} />
          <LastMinuteWeekendDeals deals={weekendDeals} />
        </div>
      </div>
      
      <AppBanner />
    </main>
  );
}
