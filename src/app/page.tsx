import React from 'react';
import {
  Header,
  Hero,
  RecentlyViewed,
  DealsSection,
  YourRecentSearches,
  LastMinuteWeekendDeals,
  StaysForEveryStyle,
  ExploreVacationPackages,
  ExploreUniqueStays,
  AppBanner,
  Footer
} from '@/components/landing';

export default function Home() {
  return (
    <>
      <Header />
      <main>
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
      <Footer />
    </>
  );
}
