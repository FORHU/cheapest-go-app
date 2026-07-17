import React from 'react';

/**
 * Single source of truth for the Terms of Service and Privacy Policy body.
 *
 * Both the standalone legal pages (`/terms-of-service`, `/privacy-policy`) and
 * the on-demand LegalModal render from these arrays, so the wording never drifts
 * between the page and the modal. This module has no "use client" directive, so
 * it is importable by both server components (the pages) and client components
 * (the modal).
 */

export interface LegalSection {
    title: string;
    content: React.ReactNode;
}

export const LEGAL_EFFECTIVE_DATE = 'May 1, 2025';
export const LEGAL_LAST_UPDATED = 'April 1, 2025';

export const termsSections: LegalSection[] = [
    {
        title: 'Acceptance of Terms',
        content: (
            <p>
                By accessing or using the CheapestGo website and services (the "Platform"), you agree to
                be bound by these Terms of Service ("Terms") and all applicable laws and regulations. If
                you do not agree to these Terms, you may not use the Platform. CheapestGo is operated by
                JTP Partners, 30 Wall Street, 8th Floor, New York, NY 10005, United States. These Terms
                constitute a legally binding agreement between you and CheapestGo.
            </p>
        ),
    },
    {
        title: 'Eligibility',
        content: (
            <>
                <p>To use CheapestGo, you must:</p>
                <ul className="list-disc pl-5 space-y-1">
                    <li>Be at least 18 years of age</li>
                    <li>Have the legal capacity to enter into a binding contract</li>
                    <li>Not be prohibited from using the Platform under applicable laws</li>
                    <li>Provide accurate, current, and complete information when creating an account or making a booking</li>
                </ul>
            </>
        ),
    },
    {
        title: 'Account Registration',
        content: (
            <>
                <p>
                    To access certain features of the Platform, you may need to create an account. You agree to:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                    <li>Provide accurate and truthful information during registration</li>
                    <li>Keep your login credentials confidential and not share them with third parties</li>
                    <li>Notify us immediately of any unauthorized use of your account</li>
                    <li>Be responsible for all activity that occurs under your account</li>
                </ul>
                <p>
                    CheapestGo reserves the right to suspend or terminate accounts that violate these Terms
                    or that are inactive for an extended period.
                </p>
            </>
        ),
    },
    {
        title: 'Booking Process and Confirmation',
        content: (
            <>
                <p>
                    When you make a booking through CheapestGo, you are entering into a contract with the
                    travel supplier (hotel, airline, or package provider), not with CheapestGo. CheapestGo
                    acts as an intermediary facilitating the booking.
                </p>
                <ul className="list-disc pl-5 space-y-1.5">
                    <li>
                        <strong>Booking confirmation:</strong> A booking is confirmed only when you receive a
                        written confirmation email from CheapestGo with a booking reference number.
                    </li>
                    <li>
                        <strong>Accuracy:</strong> You are responsible for ensuring all booking details
                        (dates, guest names, room type) are correct before confirming payment.
                    </li>
                    <li>
                        <strong>Supplier terms:</strong> Your booking is subject to the terms and conditions
                        of the individual travel supplier, including their cancellation and no-show policies.
                    </li>
                    <li>
                        <strong>Availability:</strong> Prices and availability are not guaranteed until
                        payment is successfully processed and a confirmation is issued.
                    </li>
                </ul>
            </>
        ),
    },
    {
        title: 'Pricing and Payments',
        content: (
            <>
                <ul className="list-disc pl-5 space-y-1.5">
                    <li>
                        <strong>Markup:</strong> CheapestGo applies a transparent service markup (currently
                        12%) to wholesale hotel and travel rates. This markup is included in the price shown
                        to you — there are no hidden fees.
                    </li>
                    <li>
                        <strong>Currency:</strong> Prices are displayed in the currency of your choosing.
                        Currency conversion rates are provided for reference and may vary at time of payment.
                    </li>
                    <li>
                        <strong>Payment processing:</strong> All payments are processed securely by Stripe,
                        Inc. By making a payment, you also agree to Stripe's terms of service. CheapestGo
                        does not store your card details.
                    </li>
                    <li>
                        <strong>Taxes and fees:</strong> Displayed prices include applicable service fees.
                        Local taxes or tourism fees charged directly by the hotel at check-in are not included
                        unless stated otherwise.
                    </li>
                    <li>
                        <strong>Price changes:</strong> Prices are subject to change until payment is
                        completed. We are not liable for price fluctuations prior to booking confirmation.
                    </li>
                </ul>
            </>
        ),
    },
    {
        title: 'Cancellations and Refunds',
        content: (
            <p>
                Cancellations and refunds are governed by our{' '}
                <a href="/refund-policy" className="text-blue-600 dark:text-blue-400 hover:underline">
                    Refund &amp; Cancellation Policy
                </a>
                , which is incorporated into these Terms by reference. Please review it carefully before
                making a booking, as policies vary by hotel and rate type.
            </p>
        ),
    },
    {
        title: 'Prohibited Conduct',
        content: (
            <>
                <p>You agree not to:</p>
                <ul className="list-disc pl-5 space-y-1">
                    <li>Use the Platform for any unlawful purpose or in violation of any regulations</li>
                    <li>Make fraudulent bookings, use stolen payment credentials, or engage in chargebacks in bad faith</li>
                    <li>Attempt to reverse-engineer, scrape, or extract data from the Platform</li>
                    <li>Use automated bots or scripts to access or interact with the Platform</li>
                    <li>Resell or redistribute bookings for commercial purposes without our written consent</li>
                    <li>Post false or misleading information, reviews, or impersonate any person or entity</li>
                    <li>Interfere with the security, integrity, or performance of the Platform</li>
                    <li>Harass, threaten, or harm other users or CheapestGo staff</li>
                </ul>
            </>
        ),
    },
    {
        title: 'Intellectual Property',
        content: (
            <p>
                All content on the CheapestGo Platform — including logos, text, graphics, software, and
                design — is the property of CheapestGo or its licensors and is protected by applicable
                intellectual property laws. You may not reproduce, distribute, or create derivative works
                from our content without prior written consent. Hotel and flight images and descriptions are provided
                by our partners (Duffel, Mystifly, TravelgateX, ONDA, Rakuten) and respective suppliers under license.
            </p>
        ),
    },
    {
        title: 'Disclaimers',
        content: (
            <>
                <p>
                    CheapestGo provides its services on an "as is" and "as available" basis. We do not
                    guarantee that:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                    <li>The Platform will be uninterrupted, error-free, or free of viruses</li>
                    <li>Hotel descriptions, photos, or amenity lists are fully accurate (these are provided by suppliers)</li>
                    <li>Prices displayed will always be the lowest available in the market</li>
                    <li>All bookings will be honored by the travel supplier in the event of supplier insolvency or overbooking</li>
                </ul>
                <p>
                    CheapestGo is not responsible for the acts, errors, omissions, representations,
                    warranties, or negligence of any travel supplier.
                </p>
            </>
        ),
    },
    {
        title: 'Limitation of Liability',
        content: (
            <p>
                To the maximum extent permitted by applicable law, CheapestGo, its officers, directors,
                employees, and affiliates shall not be liable for any indirect, incidental, special,
                consequential, or punitive damages, including loss of profits, data, or goodwill, arising
                out of or in connection with your use of the Platform or any booking made through it. Our
                total aggregate liability to you for any claim arising out of these Terms shall not exceed
                the total amount paid by you for the booking giving rise to the claim.
            </p>
        ),
    },
    {
        title: 'Indemnification',
        content: (
            <p>
                You agree to indemnify, defend, and hold harmless CheapestGo and JTP Partners from and
                against any claims, liabilities, damages, losses, and expenses (including legal fees)
                arising out of or in any way connected with your use of the Platform, your violation of
                these Terms, or your violation of any rights of another person.
            </p>
        ),
    },
    {
        title: 'Governing Law and Dispute Resolution',
        content: (
            <>
                <p>
                    These Terms are governed by the laws of the State of New York, United States, without
                    regard to its conflict of law provisions.
                </p>
                <p>
                    Any dispute arising from or relating to these Terms or your use of CheapestGo shall
                    first be attempted to be resolved through good-faith negotiation. If unresolved within
                    30 days, disputes shall be submitted to binding arbitration in New York City, New York,
                    under the rules of the American Arbitration Association (AAA). You waive any right to
                    participate in a class action lawsuit or class-wide arbitration.
                </p>
            </>
        ),
    },
    {
        title: 'Changes to These Terms',
        content: (
            <p>
                CheapestGo reserves the right to modify these Terms at any time. We will notify registered
                users of material changes via email and by posting an updated version on the Platform with
                a revised "Last Updated" date. Your continued use of the Platform after changes take effect
                constitutes your acceptance of the revised Terms.
            </p>
        ),
    },
    {
        title: 'Contact',
        content: (
            <>
                <p>For questions about these Terms:</p>
                <ul className="list-none space-y-1">
                    <li>📧 support@cheapestgo.com</li>
                    <li>🏢 JTP Partners · 30 Wall Street, 8th Floor · New York, NY 10005 · USA</li>
                </ul>
            </>
        ),
    },
];

export const privacySections: LegalSection[] = [
    {
        title: 'Who We Are',
        content: (
            <>
                <p>
                    CheapestGo ("we," "us," or "our") is an online travel agency operated by JTP Partners,
                    located at 30 Wall Street, 8th Floor, New York, NY 10005, United States. We provide hotel
                    booking, flight package, and travel deal services primarily to travelers in Southeast Asia
                    through our website and mobile platform.
                </p>
                <p>
                    For questions regarding this Privacy Policy, contact us at{' '}
                    <a href="mailto:support@cheapestgo.com" className="text-blue-600 dark:text-blue-400 hover:underline">
                        support@cheapestgo.com
                    </a>.
                </p>
            </>
        ),
    },
    {
        title: 'Information We Collect',
        content: (
            <>
                <p><strong>Information you provide directly:</strong></p>
                <ul className="list-disc pl-5 space-y-1">
                    <li>Name, email address, phone number, and date of birth when creating an account or making a booking</li>
                    <li>Billing address and payment information (processed securely by Stripe — we do not store card numbers)</li>
                    <li>Travel preferences, search history, and past booking details</li>
                    <li>Communications you send us via email or support channels</li>
                </ul>
                <p><strong>Information collected automatically:</strong></p>
                <ul className="list-disc pl-5 space-y-1">
                    <li>IP address, browser type, operating system, and device identifiers</li>
                    <li>Pages visited, time spent on pages, links clicked, and referral URLs</li>
                    <li>Cookies, web beacons, and similar tracking technologies (see our Cookie Policy)</li>
                    <li>Location data (country/region level) derived from your IP address</li>
                </ul>
                <p><strong>Information from third parties:</strong></p>
                <ul className="list-disc pl-5 space-y-1">
                    <li>Travel availability and pricing data from our partners (Duffel, Mystifly, TravelgateX, ONDA, Rakuten)</li>
                    <li>Payment confirmation and fraud signals from Stripe</li>
                    <li>Analytics data from service providers we use to improve our platform</li>
                </ul>
            </>
        ),
    },
    {
        title: 'How We Use Your Information',
        content: (
            <ul className="list-disc pl-5 space-y-1.5">
                <li>To process and confirm your travel bookings and send booking confirmations</li>
                <li>To process payments and prevent fraud through Stripe</li>
                <li>To create and manage your CheapestGo account</li>
                <li>To send transactional emails (booking confirmations, receipts, itinerary updates)</li>
                <li>To send promotional emails and deal alerts — only with your consent, and you may opt out at any time</li>
                <li>To improve our platform, personalize content, and analyze usage patterns</li>
                <li>To comply with legal obligations and enforce our Terms of Service</li>
                <li>To respond to your inquiries and provide customer support</li>
            </ul>
        ),
    },
    {
        title: 'How We Share Your Information',
        content: (
            <>
                <p>We do not sell your personal information. We share your data only in the following circumstances:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                    <li>
                        <strong>Hotels and travel suppliers:</strong> Your name, contact details, and booking
                        information are shared with hotels and suppliers to fulfill your reservation.
                    </li>
                    <li>
                        <strong>Stripe:</strong> Payment information is processed by Stripe, Inc. Stripe's
                        privacy policy governs how they handle your payment data. See{' '}
                        <a href="https://stripe.com/privacy" className="text-blue-600 dark:text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">stripe.com/privacy</a>.
                    </li>
                    <li>
                        <strong>Travel Partners (Duffel, Mystifly, TravelgateX, ONDA, Rakuten):</strong> Search queries and booking details are processed through our partner APIs to retrieve availability and pricing.
                    </li>
                    <li>
                        <strong>Supabase:</strong> Our database infrastructure is hosted on Supabase. Data is
                        stored with encryption at rest and in transit.
                    </li>
                    <li>
                        <strong>Legal requirements:</strong> We may disclose information when required by law,
                        court order, or to protect the rights, property, or safety of CheapestGo or others.
                    </li>
                </ul>
            </>
        ),
    },
    {
        title: 'Cookies and Tracking Technologies',
        content: (
            <p>
                We use cookies and similar technologies to operate our platform and improve your
                experience. Please see our{' '}
                <a href="/cookie-policy" className="text-blue-600 dark:text-blue-400 hover:underline">
                    Cookie Policy
                </a>{' '}
                for full details on what cookies we use and how to manage your preferences.
            </p>
        ),
    },
    {
        title: 'Data Retention',
        content: (
            <>
                <p>We retain your personal data for as long as necessary to:</p>
                <ul className="list-disc pl-5 space-y-1">
                    <li>Maintain your account and provide our services</li>
                    <li>Comply with legal, tax, and accounting obligations (typically 7 years for financial records)</li>
                    <li>Resolve disputes and enforce our agreements</li>
                </ul>
                <p>
                    When you delete your account, we will delete or anonymize your personal data within
                    90 days, except where retention is required by law.
                </p>
            </>
        ),
    },
    {
        title: 'International Data Transfers',
        content: (
            <p>
                CheapestGo is headquartered in the United States. When you use our services from
                Southeast Asia or other regions, your data is transferred to and processed in the United
                States. We ensure appropriate safeguards are in place for international transfers,
                including standard contractual clauses where required under applicable law (including
                GDPR and the Philippine Data Privacy Act of 2012, Republic Act No. 10173).
            </p>
        ),
    },
    {
        title: 'Your Rights and Choices',
        content: (
            <>
                <p>Depending on your jurisdiction, you may have the following rights:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                    <li><strong>Access:</strong> Request a copy of the personal data we hold about you</li>
                    <li><strong>Correction:</strong> Request correction of inaccurate or incomplete data</li>
                    <li><strong>Deletion:</strong> Request deletion of your personal data ("right to be forgotten")</li>
                    <li><strong>Portability:</strong> Receive your data in a structured, machine-readable format</li>
                    <li><strong>Opt-out:</strong> Unsubscribe from marketing emails at any time using the link in our emails</li>
                    <li><strong>Withdraw consent:</strong> Where processing is based on consent, you may withdraw it at any time</li>
                </ul>
                <p>
                    To exercise any of these rights, email us at{' '}
                    <a href="mailto:support@cheapestgo.com" className="text-blue-600 dark:text-blue-400 hover:underline">
                        support@cheapestgo.com
                    </a>
                    . We will respond within 30 days.
                </p>
            </>
        ),
    },
    {
        title: "Children's Privacy",
        content: (
            <p>
                CheapestGo is not intended for children under the age of 18. We do not knowingly collect
                personal information from children. If you believe we have inadvertently collected
                information from a child, please contact us immediately at support@cheapestgo.com
                and we will delete such information promptly.
            </p>
        ),
    },
    {
        title: 'Security',
        content: (
            <p>
                We implement industry-standard technical and organizational measures to protect your
                personal data, including encryption in transit (TLS/HTTPS), encryption at rest, access
                controls, and regular security reviews. Payment data is handled exclusively by Stripe,
                which is PCI DSS compliant. However, no method of transmission over the internet is
                completely secure, and we cannot guarantee absolute security.
            </p>
        ),
    },
    {
        title: 'Changes to This Policy',
        content: (
            <p>
                We may update this Privacy Policy from time to time. When we make material changes, we
                will notify you by email (if you have an account) or by posting a prominent notice on our
                website. Your continued use of CheapestGo after the effective date of the revised policy
                constitutes your acceptance of the changes.
            </p>
        ),
    },
    {
        title: 'Contact Us',
        content: (
            <>
                <p>For privacy-related inquiries, requests, or complaints:</p>
                <ul className="list-none space-y-1">
                    <li>📧 support@cheapestgo.com</li>
                    <li>🏢 JTP Partners · 30 Wall Street, 8th Floor · New York, NY 10005 · USA</li>
                </ul>
            </>
        ),
    },
];
