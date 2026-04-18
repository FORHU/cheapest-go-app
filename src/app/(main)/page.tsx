export const revalidate = 1800; // regenerate every 30 minutes

import { Suspense } from "react";
import Script from "next/script";
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

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'CheapestGo',
  url: 'https://cheapestgo.com',
  logo: 'https://cheapestgo.com/icon-192.png',
  sameAs: [],
  description: 'CheapestGo is a modern travel booking platform helping travelers find the cheapest flights and hotels worldwide.',
};

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'How does CheapestGo find cheap flights?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'CheapestGo searches across multiple airlines and global distribution systems to surface the lowest available fares in real time, letting you compare and book in one place.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I book both flights and hotels on CheapestGo?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. CheapestGo supports booking flights, hotels, apartments, and unique stays — all from a single platform.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is CheapestGo free to use?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, searching and comparing prices on CheapestGo is completely free. You only pay when you book.',
      },
    },
    {
      '@type': 'Question',
      name: 'What currencies does CheapestGo support?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'CheapestGo supports multiple currencies and automatically converts prices based on your preference so you can always see costs in your local currency.',
      },
    },
  ],
};

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between pb-20">
      <Script
        id="organization-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <Script
        id="faq-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
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
