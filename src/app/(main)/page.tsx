export const revalidate = 300; // regenerate every 5 minutes

import { Suspense } from "react";
import Script from "next/script";
import { Hero } from "@/components/landing/hero";
import { RecentlyViewed, YourRecentSearches, TopCitiesSection, TopDestinationsSection } from "@/components/landing/sections";
import { PopularDestinationsSection } from "@/components/landing/sections/PopularDestinationsSection";
import { HowItWorksSection } from "@/components/landing/sections/HowItWorksSection";
import {
  SectionSkeleton,
  DealsSectionStream,
} from "./_sections";
import { getTranslations } from 'next-intl/server';

export default async function Home() {
  const t = await getTranslations('seo');
  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'CheapestGo',
    url: 'https://cheapestgo.com',
    logo: 'https://cheapestgo.com/icon-192.png',
    sameAs: [],
    description: t('orgDescription'),
  };

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: t('faq.q1'), acceptedAnswer: { '@type': 'Answer', text: t('faq.a1') } },
      { '@type': 'Question', name: t('faq.q2'), acceptedAnswer: { '@type': 'Answer', text: t('faq.a2') } },
      { '@type': 'Question', name: t('faq.q3'), acceptedAnswer: { '@type': 'Answer', text: t('faq.a3') } },
      { '@type': 'Question', name: t('faq.q4'), acceptedAnswer: { '@type': 'Answer', text: t('faq.a4') } },
    ],
  };
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
          <TopCitiesSection />
          <TopDestinationsSection />

          {/* Data sections — each streams independently */}
          <Suspense fallback={<SectionSkeleton />}>
            <DealsSectionStream />
          </Suspense>

          <PopularDestinationsSection />
          <HowItWorksSection />
        </div>
      </div>

    </main>
  );
}
