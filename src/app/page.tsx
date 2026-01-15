import React from 'react';
import Header from '@/components/Header';
import Hero from '@/components/Hero';
import DestinationsGrid from '@/components/DestinationsGrid';
import Footer from '@/components/Footer';

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <DestinationsGrid />
      </main>
      <Footer />
    </>
  );
}

