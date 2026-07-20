import React from 'react';

/**
 * Single source of truth for all four legal policy page bodies.
 *
 * Both the standalone legal pages and the on-demand LegalModal render from
 * these functions, so the wording never drifts. This module has no "use client"
 * directive, so it is importable by both server components (the pages) and
 * client components (the modal).
 *
 * Each function accepts a `Translator` scoped to the "legal" namespace, e.g.
 * the result of `useTranslations('legal')` or `await getTranslations('legal')`.
 */

export interface LegalSection {
    title: string;
    content: React.ReactNode;
}

export const LEGAL_EFFECTIVE_DATE = 'May 1, 2025';
export const LEGAL_LAST_UPDATED = 'April 1, 2025';

interface Translator {
    (key: string): string;
    raw: (key: string) => unknown;
}

// ---------------------------------------------------------------------------
// Terms of Service
// ---------------------------------------------------------------------------

export function getTermsSections(t: Translator): LegalSection[] {
    return [
        {
            title: t('content.terms.acceptance.title'),
            content: <p>{t('content.terms.acceptance.body')}</p>,
        },
        {
            title: t('content.terms.eligibility.title'),
            content: (
                <>
                    <p>{t('content.terms.eligibility.intro')}</p>
                    <ul className="list-disc pl-5 space-y-1">
                        {(t.raw('content.terms.eligibility.items') as string[]).map((item, i) => (
                            <li key={i}>{item}</li>
                        ))}
                    </ul>
                </>
            ),
        },
        {
            title: t('content.terms.accountRegistration.title'),
            content: (
                <>
                    <p>{t('content.terms.accountRegistration.intro')}</p>
                    <ul className="list-disc pl-5 space-y-1">
                        {(t.raw('content.terms.accountRegistration.items') as string[]).map((item, i) => (
                            <li key={i}>{item}</li>
                        ))}
                    </ul>
                    <p>{t('content.terms.accountRegistration.note')}</p>
                </>
            ),
        },
        {
            title: t('content.terms.bookingProcess.title'),
            content: (
                <>
                    <p>{t('content.terms.bookingProcess.intro')}</p>
                    <ul className="list-disc pl-5 space-y-1.5">
                        {(t.raw('content.terms.bookingProcess.items') as Array<{ label: string; text: string }>).map((item, i) => (
                            <li key={i}>
                                <strong>{item.label}:</strong> {item.text}
                            </li>
                        ))}
                    </ul>
                </>
            ),
        },
        {
            title: t('content.terms.pricing.title'),
            content: (
                <ul className="list-disc pl-5 space-y-1.5">
                    {(t.raw('content.terms.pricing.items') as Array<{ label: string; text: string }>).map((item, i) => (
                        <li key={i}>
                            <strong>{item.label}:</strong> {item.text}
                        </li>
                    ))}
                </ul>
            ),
        },
        {
            title: t('content.terms.cancellations.title'),
            content: (
                <p>
                    {t('content.terms.cancellations.textBefore')}{' '}
                    <a href="/refund-policy" className="text-blue-600 dark:text-blue-400 hover:underline">
                        {t('content.terms.cancellations.refundLinkText')}
                    </a>
                    {t('content.terms.cancellations.textAfter')}
                </p>
            ),
        },
        {
            title: t('content.terms.prohibitedConduct.title'),
            content: (
                <>
                    <p>{t('content.terms.prohibitedConduct.intro')}</p>
                    <ul className="list-disc pl-5 space-y-1">
                        {(t.raw('content.terms.prohibitedConduct.items') as string[]).map((item, i) => (
                            <li key={i}>{item}</li>
                        ))}
                    </ul>
                </>
            ),
        },
        {
            title: t('content.terms.intellectualProperty.title'),
            content: <p>{t('content.terms.intellectualProperty.body')}</p>,
        },
        {
            title: t('content.terms.disclaimers.title'),
            content: (
                <>
                    <p>{t('content.terms.disclaimers.intro')}</p>
                    <ul className="list-disc pl-5 space-y-1">
                        {(t.raw('content.terms.disclaimers.items') as string[]).map((item, i) => (
                            <li key={i}>{item}</li>
                        ))}
                    </ul>
                    <p>{t('content.terms.disclaimers.note')}</p>
                </>
            ),
        },
        {
            title: t('content.terms.liability.title'),
            content: <p>{t('content.terms.liability.body')}</p>,
        },
        {
            title: t('content.terms.indemnification.title'),
            content: <p>{t('content.terms.indemnification.body')}</p>,
        },
        {
            title: t('content.terms.governingLaw.title'),
            content: (
                <>
                    <p>{t('content.terms.governingLaw.para1')}</p>
                    <p>{t('content.terms.governingLaw.para2')}</p>
                </>
            ),
        },
        {
            title: t('content.terms.changes.title'),
            content: <p>{t('content.terms.changes.body')}</p>,
        },
        {
            title: t('content.terms.contact.title'),
            content: (
                <>
                    <p>{t('content.terms.contact.intro')}</p>
                    <ul className="list-none space-y-1">
                        <li>{t('content.terms.contact.email')}</li>
                        <li>{t('content.terms.contact.address')}</li>
                    </ul>
                </>
            ),
        },
    ];
}

// ---------------------------------------------------------------------------
// Privacy Policy
// ---------------------------------------------------------------------------

export function getPrivacySections(t: Translator): LegalSection[] {
    return [
        {
            title: t('content.privacy.whoWeAre.title'),
            content: (
                <>
                    <p>{t('content.privacy.whoWeAre.para1')}</p>
                    <p>
                        {t('content.privacy.whoWeAre.para2Before')}{' '}
                        <a href="mailto:support@cheapestgo.com" className="text-blue-600 dark:text-blue-400 hover:underline">
                            support@cheapestgo.com
                        </a>
                        {t('content.privacy.whoWeAre.para2After')}
                    </p>
                </>
            ),
        },
        {
            title: t('content.privacy.informationWeCollect.title'),
            content: (
                <>
                    <p><strong>{t('content.privacy.informationWeCollect.directLabel')}</strong></p>
                    <ul className="list-disc pl-5 space-y-1">
                        {(t.raw('content.privacy.informationWeCollect.directItems') as string[]).map((item, i) => (
                            <li key={i}>{item}</li>
                        ))}
                    </ul>
                    <p><strong>{t('content.privacy.informationWeCollect.autoLabel')}</strong></p>
                    <ul className="list-disc pl-5 space-y-1">
                        {(t.raw('content.privacy.informationWeCollect.autoItems') as string[]).map((item, i) => (
                            <li key={i}>{item}</li>
                        ))}
                    </ul>
                    <p><strong>{t('content.privacy.informationWeCollect.thirdPartyLabel')}</strong></p>
                    <ul className="list-disc pl-5 space-y-1">
                        {(t.raw('content.privacy.informationWeCollect.thirdPartyItems') as string[]).map((item, i) => (
                            <li key={i}>{item}</li>
                        ))}
                    </ul>
                </>
            ),
        },
        {
            title: t('content.privacy.howWeUse.title'),
            content: (
                <ul className="list-disc pl-5 space-y-1.5">
                    {(t.raw('content.privacy.howWeUse.items') as string[]).map((item, i) => (
                        <li key={i}>{item}</li>
                    ))}
                </ul>
            ),
        },
        {
            title: t('content.privacy.howWeShare.title'),
            content: (
                <>
                    <p>{t('content.privacy.howWeShare.intro')}</p>
                    <ul className="list-disc pl-5 space-y-1.5">
                        {(t.raw('content.privacy.howWeShare.items') as Array<{ label: string; text: string; linkText?: string; linkHref?: string }>).map((item, i) => (
                            <li key={i}>
                                <strong>{item.label}:</strong>{' '}
                                {item.text}
                                {item.linkText && (
                                    <>{' '}<a href={item.linkHref} className="text-blue-600 dark:text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">{item.linkText}</a>.</>
                                )}
                            </li>
                        ))}
                    </ul>
                </>
            ),
        },
        {
            title: t('content.privacy.cookies.title'),
            content: (
                <p>
                    {t('content.privacy.cookies.textBefore')}{' '}
                    <a href="/cookie-policy" className="text-blue-600 dark:text-blue-400 hover:underline">
                        {t('content.privacy.cookies.linkText')}
                    </a>{' '}
                    {t('content.privacy.cookies.textAfter')}
                </p>
            ),
        },
        {
            title: t('content.privacy.dataRetention.title'),
            content: (
                <>
                    <p>{t('content.privacy.dataRetention.intro')}</p>
                    <ul className="list-disc pl-5 space-y-1">
                        {(t.raw('content.privacy.dataRetention.items') as string[]).map((item, i) => (
                            <li key={i}>{item}</li>
                        ))}
                    </ul>
                    <p>{t('content.privacy.dataRetention.note')}</p>
                </>
            ),
        },
        {
            title: t('content.privacy.internationalTransfers.title'),
            content: <p>{t('content.privacy.internationalTransfers.body')}</p>,
        },
        {
            title: t('content.privacy.yourRights.title'),
            content: (
                <>
                    <p>{t('content.privacy.yourRights.intro')}</p>
                    <ul className="list-disc pl-5 space-y-1.5">
                        {(t.raw('content.privacy.yourRights.items') as Array<{ label: string; text: string }>).map((item, i) => (
                            <li key={i}><strong>{item.label}:</strong> {item.text}</li>
                        ))}
                    </ul>
                    <p>
                        {t('content.privacy.yourRights.emailBefore')}{' '}
                        <a href="mailto:support@cheapestgo.com" className="text-blue-600 dark:text-blue-400 hover:underline">
                            support@cheapestgo.com
                        </a>
                        {t('content.privacy.yourRights.emailAfter')}
                    </p>
                </>
            ),
        },
        {
            title: t('content.privacy.childrensPrivacy.title'),
            content: <p>{t('content.privacy.childrensPrivacy.body')}</p>,
        },
        {
            title: t('content.privacy.security.title'),
            content: <p>{t('content.privacy.security.body')}</p>,
        },
        {
            title: t('content.privacy.changes.title'),
            content: <p>{t('content.privacy.changes.body')}</p>,
        },
        {
            title: t('content.privacy.contact.title'),
            content: (
                <>
                    <p>{t('content.privacy.contact.intro')}</p>
                    <ul className="list-none space-y-1">
                        <li>{t('content.privacy.contact.email')}</li>
                        <li>{t('content.privacy.contact.address')}</li>
                    </ul>
                </>
            ),
        },
    ];
}

// ---------------------------------------------------------------------------
// Refund & Cancellation Policy
// ---------------------------------------------------------------------------

export function getRefundSections(t: Translator): LegalSection[] {
    return [
        {
            title: t('content.refund.overview.title'),
            content: <p>{t('content.refund.overview.body')}</p>,
        },
        {
            title: t('content.refund.cancellationTypes.title'),
            content: (
                <>
                    <p>{t('content.refund.cancellationTypes.intro')}</p>
                    <div className="space-y-3 mt-2">
                        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                            <p className="font-semibold text-green-800 dark:text-green-300 mb-1">
                                {t('content.refund.cancellationTypes.free.heading')}
                            </p>
                            <p className="text-slate-600 dark:text-slate-300">
                                {t('content.refund.cancellationTypes.free.body')}
                            </p>
                        </div>
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                            <p className="font-semibold text-yellow-800 dark:text-yellow-300 mb-1">
                                {t('content.refund.cancellationTypes.partial.heading')}
                            </p>
                            <p className="text-slate-600 dark:text-slate-300">
                                {t('content.refund.cancellationTypes.partial.body')}
                            </p>
                        </div>
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                            <p className="font-semibold text-red-800 dark:text-red-300 mb-1">
                                {t('content.refund.cancellationTypes.nonRefundable.heading')}
                            </p>
                            <p className="text-slate-600 dark:text-slate-300">
                                {t('content.refund.cancellationTypes.nonRefundable.body')}
                            </p>
                        </div>
                    </div>
                </>
            ),
        },
        {
            title: t('content.refund.howToCancel.title'),
            content: (
                <>
                    <p>{t('content.refund.howToCancel.intro')}</p>
                    <ol className="list-decimal pl-5 space-y-1.5">
                        {(t.raw('content.refund.howToCancel.steps') as string[]).map((step, i) => (
                            <li key={i}>{step}</li>
                        ))}
                    </ol>
                    <p>
                        {t('content.refund.howToCancel.emailBefore')}{' '}
                        <a href="mailto:support@cheapestgo.com" className="text-blue-600 dark:text-blue-400 hover:underline">
                            support@cheapestgo.com
                        </a>{' '}
                        {t('content.refund.howToCancel.emailAfter')}
                    </p>
                </>
            ),
        },
        {
            title: t('content.refund.processing.title'),
            content: (
                <ul className="list-disc pl-5 space-y-1.5">
                    {(t.raw('content.refund.processing.items') as Array<{ label: string; text: string }>).map((item, i) => (
                        <li key={i}>
                            <strong>{item.label}:</strong> {item.text}
                        </li>
                    ))}
                </ul>
            ),
        },
        {
            title: t('content.refund.noShows.title'),
            content: <p>{t('content.refund.noShows.body')}</p>,
        },
        {
            title: t('content.refund.amendments.title'),
            content: (
                <>
                    <p>{t('content.refund.amendments.intro')}</p>
                    <ol className="list-decimal pl-5 space-y-1">
                        {(t.raw('content.refund.amendments.steps') as string[]).map((step, i) => (
                            <li key={i}>{step}</li>
                        ))}
                    </ol>
                    <p>
                        <strong>{t('content.refund.amendments.noteLabel')}</strong>{' '}
                        {t('content.refund.amendments.noteText')}
                    </p>
                </>
            ),
        },
        {
            title: t('content.refund.supplierCancellations.title'),
            content: (
                <>
                    <p>{t('content.refund.supplierCancellations.intro')}</p>
                    <ul className="list-disc pl-5 space-y-1">
                        {(t.raw('content.refund.supplierCancellations.items') as string[]).map((item, i) => (
                            <li key={i}>{item}</li>
                        ))}
                    </ul>
                    <p>{t('content.refund.supplierCancellations.note')}</p>
                </>
            ),
        },
        {
            title: t('content.refund.disputes.title'),
            content: <p>{t('content.refund.disputes.body')}</p>,
        },
        {
            title: t('content.refund.flightPackages.title'),
            content: <p>{t('content.refund.flightPackages.body')}</p>,
        },
        {
            title: t('content.refund.contact.title'),
            content: (
                <>
                    <p>{t('content.refund.contact.intro')}</p>
                    <ul className="list-none space-y-1">
                        <li>{t('content.refund.contact.email')}</li>
                        <li>{t('content.refund.contact.address')}</li>
                    </ul>
                    <p>{t('content.refund.contact.outro')}</p>
                </>
            ),
        },
    ];
}

// ---------------------------------------------------------------------------
// Cookie Policy
// ---------------------------------------------------------------------------

export function getCookieSections(t: Translator): LegalSection[] {
    return [
        {
            title: t('content.cookie.whatAreCookies.title'),
            content: <p>{t('content.cookie.whatAreCookies.body')}</p>,
        },
        {
            title: t('content.cookie.whyWeUse.title'),
            content: (
                <>
                    <p>{t('content.cookie.whyWeUse.intro')}</p>
                    <ul className="list-disc pl-5 space-y-1">
                        {(t.raw('content.cookie.whyWeUse.items') as string[]).map((item, i) => (
                            <li key={i}>{item}</li>
                        ))}
                    </ul>
                </>
            ),
        },
        {
            title: t('content.cookie.types.title'),
            content: (
                <div className="space-y-4">
                    {(t.raw('content.cookie.types.categories') as Array<{ heading: string; body: string; items?: string[] }>).map((cat, i) => (
                        <div key={i}>
                            <p className="font-semibold text-slate-800 dark:text-slate-200 mb-1">{cat.heading}</p>
                            <p>{cat.body}</p>
                            {cat.items && (
                                <ul className="list-disc pl-5 space-y-0.5 mt-1">
                                    {cat.items.map((item, j) => (
                                        <li key={j}>{item}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    ))}
                </div>
            ),
        },
        {
            title: t('content.cookie.thirdParty.title'),
            content: (
                <>
                    <p>{t('content.cookie.thirdParty.intro')}</p>
                    <ul className="list-disc pl-5 space-y-1.5">
                        <li>
                            <strong>Stripe</strong> — {t('content.cookie.thirdParty.stripeBefore')}{' '}
                            <a href="https://stripe.com/privacy" className="text-blue-600 dark:text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">
                                {t('content.cookie.thirdParty.stripeLinkText')}
                            </a>.
                        </li>
                        <li>
                            <strong>Supabase</strong> — {t('content.cookie.thirdParty.supabaseText')}
                        </li>
                    </ul>
                    <p>{t('content.cookie.thirdParty.outro')}</p>
                </>
            ),
        },
        {
            title: t('content.cookie.duration.title'),
            content: (
                <>
                    <p>{t('content.cookie.duration.intro')}</p>
                    <ul className="list-disc pl-5 space-y-1">
                        {(t.raw('content.cookie.duration.items') as Array<{ label: string; text: string }>).map((item, i) => (
                            <li key={i}>
                                <strong>{item.label}</strong> — {item.text}
                            </li>
                        ))}
                    </ul>
                </>
            ),
        },
        {
            title: t('content.cookie.managing.title'),
            content: (
                <>
                    <p>{t('content.cookie.managing.intro')}</p>
                    <ul className="list-disc pl-5 space-y-1.5">
                        {(t.raw('content.cookie.managing.items') as Array<{ label: string; text: string }>).map((item, i) => (
                            <li key={i}>
                                <strong>{item.label}:</strong> {item.text}
                            </li>
                        ))}
                    </ul>
                    <p>{t('content.cookie.managing.note')}</p>
                </>
            ),
        },
        {
            title: t('content.cookie.doNotTrack.title'),
            content: <p>{t('content.cookie.doNotTrack.body')}</p>,
        },
        {
            title: t('content.cookie.changes.title'),
            content: <p>{t('content.cookie.changes.body')}</p>,
        },
        {
            title: t('content.cookie.contact.title'),
            content: (
                <>
                    <p>{t('content.cookie.contact.intro')}</p>
                    <ul className="list-none space-y-1">
                        <li>{t('content.cookie.contact.email')}</li>
                        <li>{t('content.cookie.contact.address')}</li>
                    </ul>
                </>
            ),
        },
    ];
}
