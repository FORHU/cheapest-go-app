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
  const brandName = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'CheapestGo';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://cheapestgo.com';
  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: brandName,
    url: siteUrl,
    logo: `${siteUrl}/icon-192.png`,
    sameAs: [],
    description: t('orgDescription', { brand: brandName }),
  };

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: t('faq.q1', { brand: brandName }), acceptedAnswer: { '@type': 'Answer', text: t('faq.a1', { brand: brandName }) } },
      { '@type': 'Question', name: t('faq.q2', { brand: brandName }), acceptedAnswer: { '@type': 'Answer', text: t('faq.a2', { brand: brandName }) } },
      { '@type': 'Question', name: t('faq.q3', { brand: brandName }), acceptedAnswer: { '@type': 'Answer', text: t('faq.a3', { brand: brandName }) } },
      { '@type': 'Question', name: t('faq.q4', { brand: brandName }), acceptedAnswer: { '@type': 'Answer', text: t('faq.a4', { brand: brandName }) } },
    ],
  };
  return (
    <main className="flex min-h-screen flex-col items-center">
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
