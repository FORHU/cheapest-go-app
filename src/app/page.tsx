import React from 'react';
import Header from '@/components/Header';
import Hero from '@/components/Hero';
import TravelTypeTabs from '@/components/TravelTypeTabs';
import DealsSection from '@/components/DealsSection';
import PropertyTypes from '@/components/PropertyTypes';
import RecentlyViewed from '@/components/RecentlyViewed';
import DestinationsGrid from '@/components/DestinationsGrid';
import AppBanner from '@/components/AppBanner';
import Footer from '@/components/Footer';

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <TravelTypeTabs />
        <Hero />
        <DealsSection />
        <PropertyTypes />
        <RecentlyViewed />
        <DestinationsGrid />
        <AppBanner />
      </main>
      <Footer />
    </>
  );
}
