import { LegalLayout } from '@/components/landing/layout/LegalLayout';
import {
  getPrivacySections,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_LAST_UPDATED,
} from '@/components/legal/content/legalSections';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal.privacyPolicy');
  return { title: t('title'), description: t('description') };
}

export default async function PrivacyPolicyPage() {
  const tMeta = await getTranslations('legal.privacyPolicy');
  const t = await getTranslations('legal');
  return (
    <LegalLayout
      title={tMeta('pageTitle')}
      subtitle={tMeta('pageSubtitle')}
      effectiveDate={LEGAL_EFFECTIVE_DATE}
      lastUpdated={LEGAL_LAST_UPDATED}
      sections={getPrivacySections(t)}
    />
  );
}
