import { LegalLayout } from '@/components/landing/layout/LegalLayout';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cookie Policy — CheapestGo',
  description: 'How CheapestGo uses cookies and similar tracking technologies.',
};

export default function CookiePolicyPage() {
  return (
    <LegalLayout
      title="Cookie Policy"
      subtitle="How we use cookies and similar technologies on CheapestGo."
      effectiveDate="May 1, 2025"
      lastUpdated="April 1, 2025"
      sections={[
        {
          title: 'What Are Cookies?',
          content: (
            <p>
              Cookies are small text files placed on your device when you visit a website. They are
              widely used to make websites work efficiently, to remember your preferences, and to
              provide information to website operators. Similar technologies include web beacons,
              pixels, local storage, and session storage, all of which we refer to collectively as
              "cookies" in this policy.
            </p>
          ),
        },
        {
          title: 'Why We Use Cookies',
          content: (
            <>
              <p>CheapestGo uses cookies to:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Keep you signed in and maintain your session securely</li>
                <li>Remember your preferences (currency, language, dark/light mode)</li>
                <li>Save your recent searches and viewed properties</li>
                <li>Prevent fraud and protect the security of your account</li>
                <li>Measure performance and understand how visitors use our platform</li>
                <li>Personalize content and show relevant deals and recommendations</li>
              </ul>
            </>
          ),
        },
        {
          title: 'Types of Cookies We Use',
          content: (
            <>
              <div className="space-y-4">
                <div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200 mb-1">Strictly Necessary Cookies</p>
                  <p>
                    These cookies are essential for the Platform to function. They enable core features
                    such as authentication, session management, security tokens, and payment processing.
                    You cannot opt out of these cookies as they are required for the service to operate.
                  </p>
                  <ul className="list-disc pl-5 space-y-0.5 mt-1">
                    <li><strong>supabase-auth-token</strong> — authentication session</li>
                    <li><strong>__stripe_mid / __stripe_sid</strong> — Stripe fraud prevention</li>
                  </ul>
                </div>

                <div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200 mb-1">Functional Cookies</p>
                  <p>
                    These cookies remember your choices and personalize your experience. Disabling them
                    may reduce functionality.
                  </p>
                  <ul className="list-disc pl-5 space-y-0.5 mt-1">
                    <li>Currency preference (e.g., KRW, USD, PHP)</li>
                    <li>Theme preference (dark or light mode)</li>
                    <li>Recently viewed hotels and search history</li>
                  </ul>
                </div>

                <div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200 mb-1">Analytics Cookies</p>
                  <p>
                    These help us understand how visitors interact with the Platform — which pages are
                    most visited, where users drop off, and how we can improve the experience. Data is
                    aggregated and anonymized where possible.
                  </p>
                  <ul className="list-disc pl-5 space-y-0.5 mt-1">
                    <li>Page view tracking and session duration</li>
                    <li>Click-through rates on deals and search results</li>
                    <li>Error logging and performance monitoring</li>
                  </ul>
                </div>

                <div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200 mb-1">Marketing Cookies</p>
                  <p>
                    We may use these to show you relevant travel deals on our Platform. We do not
                    currently serve third-party advertising. If this changes, we will update this policy
                    and request your consent.
                  </p>
                </div>
              </div>
            </>
          ),
        },
        {
          title: 'Third-Party Cookies',
          content: (
            <>
              <p>Some cookies are set by third-party services that appear on our pages:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  <strong>Stripe</strong> — sets cookies for fraud detection and payment session
                  management. See{' '}
                  <a href="https://stripe.com/privacy" className="text-blue-600 dark:text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">
                    Stripe's Privacy Policy
                  </a>.
                </li>
                <li>
                  <strong>Supabase</strong> — sets authentication cookies to manage your login session
                  on our database infrastructure.
                </li>
              </ul>
              <p>
                We have no control over third-party cookies. Please review the respective privacy
                policies of these providers for more information.
              </p>
            </>
          ),
        },
        {
          title: 'Cookie Duration',
          content: (
            <>
              <p>Cookies on CheapestGo are either:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  <strong>Session cookies</strong> — deleted automatically when you close your browser.
                  Used for login sessions and temporary state.
                </li>
                <li>
                  <strong>Persistent cookies</strong> — remain on your device for a set period (typically
                  30 days to 1 year). Used for preferences and analytics.
                </li>
              </ul>
            </>
          ),
        },
        {
          title: 'Managing Your Cookie Preferences',
          content: (
            <>
              <p>You can control cookies in several ways:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  <strong>Browser settings:</strong> Most browsers allow you to refuse or delete cookies
                  via their settings (usually under Privacy or Security). Note that disabling strictly
                  necessary cookies will break core functionality such as login and checkout.
                </li>
                <li>
                  <strong>Cookie banner:</strong> When you first visit CheapestGo, you may be presented
                  with a cookie consent banner where you can accept or decline non-essential cookies.
                </li>
                <li>
                  <strong>Opt-out tools:</strong> For analytics, you can use browser extensions such as
                  the Google Analytics Opt-out Browser Add-on where applicable.
                </li>
              </ul>
              <p>
                Adjusting your cookie settings may affect the functionality of the Platform. Essential
                cookies cannot be disabled without impacting your ability to use CheapestGo.
              </p>
            </>
          ),
        },
        {
          title: 'Do Not Track',
          content: (
            <p>
              Some browsers send a "Do Not Track" (DNT) signal. CheapestGo does not currently respond
              to DNT signals, as there is no universal standard for how websites should react to them.
              We continue to evaluate this area as standards evolve.
            </p>
          ),
        },
        {
          title: 'Changes to This Cookie Policy',
          content: (
            <p>
              We may update this Cookie Policy from time to time to reflect changes in technology,
              regulation, or our use of cookies. When we make material changes, we will update the
              "Last Updated" date at the top of this page. Continued use of the Platform after changes
              are posted constitutes your acceptance of the revised policy.
            </p>
          ),
        },
        {
          title: 'Contact',
          content: (
            <>
              <p>For questions about our use of cookies:</p>
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
