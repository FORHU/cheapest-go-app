import { LegalLayout } from '@/components/landing/layout/LegalLayout';
import {
  termsSections,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_LAST_UPDATED,
} from '@/components/legal/content/legalSections';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal.termsOfService');
  return { title: t('title'), description: t('description') };
}

export default async function TermsOfServicePage() {
  const t = await getTranslations('legal.termsOfService');
  return (
    <LegalLayout
      title={t('pageTitle')}
      subtitle={t('pageSubtitle')}
      effectiveDate={LEGAL_EFFECTIVE_DATE}
      lastUpdated={LEGAL_LAST_UPDATED}
      sections={termsSections}
    />
  );
}
