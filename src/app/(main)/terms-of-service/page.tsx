import { LegalLayout } from '@/components/landing/layout/LegalLayout';
import {
  getTermsSections,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_LAST_UPDATED,
} from '@/components/legal/content/legalSections';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { hreflangAlternates } from '@/lib/seo/hreflang';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal.termsOfService');
  return { title: t('title'), description: t('description'), alternates: hreflangAlternates('/terms-of-service') };
}

export default async function TermsOfServicePage() {
  const tMeta = await getTranslations('legal.termsOfService');
  const t = await getTranslations('legal');
  return (
    <LegalLayout
      title={tMeta('pageTitle')}
      subtitle={tMeta('pageSubtitle')}
      effectiveDate={LEGAL_EFFECTIVE_DATE}
      lastUpdated={LEGAL_LAST_UPDATED}
      sections={getTermsSections(t)}
    />
  );
}
