import React from 'react';
import Header from '@/components/Header';
import Hero from '@/components/Hero';
import RecentlyViewed from '@/components/RecentlyViewed';
import DealsSection from '@/components/DealsSection';
import {
  YourRecentSearches,
  LastMinuteWeekendDeals,
  StaysForEveryStyle,
  ExploreVacationPackages,
  ExploreUniqueStays,
} from '@/components/landing';
import AppBanner from '@/components/AppBanner';
import Footer from '@/components/Footer';

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
