import { LegalLayout } from '@/components/landing/layout/LegalLayout';
import {
  getRefundSections,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_LAST_UPDATED,
} from '@/components/legal/content/legalSections';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal.refundPolicy');
  return { title: t('title'), description: t('description') };
}

export default async function RefundPolicyPage() {
  const tMeta = await getTranslations('legal.refundPolicy');
  const t = await getTranslations('legal');
  return (
    <LegalLayout
      title={tMeta('pageTitle')}
      subtitle={tMeta('pageSubtitle')}
      effectiveDate={LEGAL_EFFECTIVE_DATE}
      lastUpdated={LEGAL_LAST_UPDATED}
      sections={getRefundSections(t)}
    />
  );
}
