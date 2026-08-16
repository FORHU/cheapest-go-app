import type { Metadata } from 'next';
import Link from 'next/link';
import {
    PlaneTakeoff,
    BedDouble,
    Package,
    BadgePercent,
    ShieldCheck,
    Globe2,
    ArrowRight,
    Mail,
} from 'lucide-react';

export const metadata: Metadata = {
    title: 'About Us — CheapestGo',
    description:
        'CheapestGo is a modern online travel agency helping travelers across Southeast Asia find and book flights, hotels, and packages at transparent prices.',
};

const whatWeDo = [
    {
        icon: PlaneTakeoff,
        title: 'Flights',
        body: 'Search and book flights worldwide through our airline partners, with clear pricing and no surprise fees at checkout.',
    },
    {
        icon: BedDouble,
        title: 'Hotels & stays',
        body: 'Millions of hotels and unique stays, sourced from leading global suppliers so you always have real availability and rates.',
    },
    {
        icon: Package,
        title: 'Deals & packages',
        body: 'Curated weekend getaways and travel deals, updated daily, so the best value is the first thing you see.',
    },
];

const values = [
    {
        icon: BadgePercent,
        title: 'Transparent pricing',
        body: 'We apply a single, transparent service markup that is already included in the price you see. No hidden fees, ever.',
    },
    {
        icon: ShieldCheck,
        title: 'Secure by default',
        body: 'Payments are processed by Stripe and we never store your card details. Your data is encrypted in transit and at rest.',
    },
    {
        icon: Globe2,
        title: 'Built for the region',
        body: 'We focus on travelers in Southeast Asia — local currencies, local context, and support that understands how you travel.',
    },
];

const partners = ['Duffel', 'TravelgateX', 'Stripe'];

export default function AboutUsPage() {
    return (
        <main className="min-h-screen">
            {/* Hero band */}
            <section className="bg-obsidian dark:bg-obsidian border-b border-white/5 px-4 py-16 sm:py-24">
                <div className="max-w-3xl mx-auto text-center">
                    <p className="text-xs font-semibold uppercase tracking-widest text-obsidian-accent mb-4 font-display">
                        About CheapestGo
                    </p>
                    <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white font-display mb-5">
                        Travel that respects your time and your wallet.
                    </h1>
                    <p className="text-slate-400 text-base sm:text-lg leading-relaxed">
                        CheapestGo is a modern travel platform that helps you discover, compare, and book
                        flights and hotels in one place — at prices you can actually trust.
                    </p>
                </div>
            </section>

            <div className="max-w-4xl mx-auto px-4 py-14 sm:py-20 space-y-20">
                {/* Mission */}
                <section>
                    <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-display mb-4">
                        Our mission
                    </h2>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-base sm:text-lg">
                        Booking travel should feel effortless, not adversarial. Too many platforms bury fees,
                        inflate prices, and make you second-guess every click. We built CheapestGo to do the
                        opposite: surface the best real prices, show exactly what you pay, and get you booked
                        in as few steps as possible — whether you are chasing a weekend escape or planning the
                        trip of a lifetime.
                    </p>
                </section>

                {/* What we do */}
                <section>
                    <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-display mb-8">
                        What we do
                    </h2>
                    <div className="grid gap-5 sm:grid-cols-3">
                        {whatWeDo.map(({ icon: Icon, title, body }) => (
                            <div
                                key={title}
                                className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-6"
                            >
                                <div className="size-11 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center mb-4">
                                    <Icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                </div>
                                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1.5">
                                    {title}
                                </h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                                    {body}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Values */}
                <section>
                    <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-display mb-8">
                        What makes us different
                    </h2>
                    <div className="space-y-4">
                        {values.map(({ icon: Icon, title, body }) => (
                            <div
                                key={title}
                                className="flex gap-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-6"
                            >
                                <div className="size-11 shrink-0 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                                    <Icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
                                        {title}
                                    </h3>
                                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                        {body}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Partners */}
                <section>
                    <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-display mb-3">
                        Powered by trusted partners
                    </h2>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
                        Our flight, hotel, and payment inventory comes from established global providers, so the
                        availability and rates you see are real and bookable.
                    </p>
                    <div className="flex flex-wrap gap-2.5">
                        {partners.map((p) => (
                            <span
                                key={p}
                                className="px-4 py-2 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-sm font-medium text-slate-700 dark:text-slate-300"
                            >
                                {p}
                            </span>
                        ))}
                    </div>
                </section>

                {/* Company + CTA */}
                <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-6 sm:p-8">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white font-display mb-4">
                        Who runs CheapestGo
                    </h2>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
                        CheapestGo is operated by FORHU Inc., headquartered at 30 Wall Street, 8th Floor,
                        New York, NY 10005, United States. Questions, feedback, or partnership ideas are always
                        welcome.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <a
                            href="mailto:support@cheapestgo.com"
                            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
                        >
                            <Mail className="h-4 w-4" />
                            Contact us
                        </a>
                        <Link
                            href="/"
                            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-white dark:hover:bg-white/5 transition-colors"
                        >
                            Start exploring
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>
                    <div className="mt-6 pt-6 border-t border-slate-200 dark:border-white/10 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
                        <Link href="/terms-of-service" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Terms of Service</Link>
                        <Link href="/privacy-policy" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Privacy Policy</Link>
                        <Link href="/refund-policy" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Refund Policy</Link>
                    </div>
                </section>
            </div>
        </main>
    );
}
