import React from 'react';
import {
  Hero,
  RecentlyViewed,
  DealsSection,
  YourRecentSearches,
  LastMinuteWeekendDeals,
  StaysForEveryStyle,
  ExploreVacationPackages,
  ExploreUniqueStays,
  AppBanner,
} from '@/components/landing';

export default function Home() {
  return (
    <main className="overflow-x-clip">
      <Hero />
      <RecentlyViewed />
      <YourRecentSearches />
      <DealsSection />
      <StaysForEveryStyle />
      <ExploreVacationPackages />
      <ExploreUniqueStays />
      <LastMinuteWeekendDeals />
      <AppBanner />
    </main>
  );
}
