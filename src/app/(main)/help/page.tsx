import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LegalLayout } from '@/components/landing/layout/LegalLayout';
import { SupportEntryLink } from '@/components/support/SupportEntryLink';
import { hreflangAlternates } from '@/lib/seo/hreflang';

const BRAND_EMAIL = process.env.NEXT_PUBLIC_BRAND_EMAIL ?? 'support@cheapestgo.com';

/**
 * What a signed-out visitor gets when they ask for help.
 *
 * A Support Chat requires an account (ADR-0032), and until this page existed that meant
 * "Support" led a signed-out visitor to a sign-in form and nothing else — a wall wearing a
 * support label. Reachable is not the same as usable, and only one of the two was true.
 *
 * So this answers the questions without asking who is reading, and offers the chat to
 * someone who wants a person. It is the shape every large travel seller uses: help articles
 * are public, and a conversation about *your* booking needs to know whose booking it is.
 *
 * The questions are the ones this system actually produces rather than a generic FAQ. A
 * payment that took with no booking behind it happened here and was hard to explain; the
 * gap between the search price and the checkout total is deliberate (see the Displayed
 * Price entry in CONTEXT.md) and a customer has no way to know that unless told.
 *
 * Built on LegalLayout because the legal pages had already solved localisation, hreflang and
 * the reading layout for exactly this kind of page — and one language per domain (ADR-0037)
 * means AirangGo serves the Korean copy without a switcher.
 */

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('help');
    return {
        title: t('title'),
        description: t('description'),
        alternates: hreflangAlternates('/help'),
    };
}

export default async function HelpPage() {
    const t = await getTranslations('help');

    const sections = [
        {
            title: t('sections.confirmation.title'),
            content: <p>{t('sections.confirmation.body')}</p>,
        },
        {
            title: t('sections.refunds.title'),
            content: (
                <>
                    <p>{t('sections.refunds.body')}</p>
                    <p className="mt-2">
                        <Link
                            href="/refund-policy"
                            className="font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
                        >
                            {t('sections.refunds.link')}
                        </Link>
                    </p>
                </>
            ),
        },
        {
            title: t('sections.changes.title'),
            content: <p>{t('sections.changes.body')}</p>,
        },
        {
            title: t('sections.priceGap.title'),
            content: <p>{t('sections.priceGap.body')}</p>,
        },
        {
            title: t('sections.payment.title'),
            content: <p>{t('sections.payment.body')}</p>,
        },
        {
            /*
             * The way to a person, at the bottom rather than the top.
             *
             * Above the articles it would be answered before it was read, and most of what
             * support is asked is answered by the five sections above it. `SupportEntryLink`
             * resolves it: the panel for someone signed in, sign-in for anyone else — and
             * the note says why, so being sent to sign in reads as an explanation rather
             * than a refusal.
             */
            title: t('chatCta'),
            content: (
                <>
                    <p>{t('chatNote')}</p>
                    <p className="mt-3">
                        <SupportEntryLink
                            label={t('chatCta')}
                            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
                        />
                    </p>
                    <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                        {t('contactHeading')}{' '}
                        <a
                            href={`mailto:${BRAND_EMAIL}`}
                            className="font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
                        >
                            {BRAND_EMAIL}
                        </a>
                    </p>
                </>
            ),
        },
    ];

    return (
        <LegalLayout
            title={t('pageTitle')}
            subtitle={t('pageSubtitle')}
            sections={sections}
        />
    );
}
