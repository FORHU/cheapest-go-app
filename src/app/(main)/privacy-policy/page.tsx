import { LegalLayout } from '@/components/landing/layout/LegalLayout';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — CheapestGo',
  description: 'How CheapestGo collects, uses, and protects your personal information.',
};

export default function PrivacyPolicyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      subtitle="How we collect, use, and protect your personal information."
      effectiveDate="May 1, 2025"
      lastUpdated="April 1, 2025"
      sections={[
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
          title: 'Children\'s Privacy',
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
      ]}
    />
  );
}
