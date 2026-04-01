import React from 'react';
import { Metadata } from 'next';
import { Sparkles, ArrowLeft } from 'lucide-react';
import { getFlightDeals } from '@/lib/server/landing/get-landing-data';
import { DealCard } from '@/components/landing/sections/DealsSection';
import BackButton from '@/components/common/BackButton';
import { FadeInUp } from '@/components/property/AnimatedContent';

export const metadata: Metadata = {
    title: 'Exclusive Flight Deals | CheapestGo',
    description: 'Browse the latest limited-time flight deals and travel offers.',
};

export default async function DealsPage() {
    const deals = await getFlightDeals();

    return (
        <main className="min-h-screen pt-4 md:pt-8 pb-20 px-4 sm:px-6 bg-slate-50 dark:bg-slate-950">
            <div className="max-w-[1400px] mx-auto">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 mb-2">
                            <BackButton label="Back to Home" href="/" />
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-xl">
                                <Sparkles className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                            </div>
                            <h1 className="text-2xl md:text-4xl font-display font-bold text-slate-900 dark:text-white">
                                Exclusive Deals & Offers
                            </h1>
                        </div>
                        <p className="text-slate-500 dark:text-slate-400 max-w-2xl">
                            Handpicked limited-time travel deals. Prices are updated frequently and may change.
                            Book early to secure the best rates.
                        </p>
                    </div>
                </div>

                {/* Deals Grid */}
                {deals.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {deals.map((deal, i) => (
                            <FadeInUp key={deal.id} delay={i * 0.05}>
                                <div className="h-full flex">
                                    {/* Wrapping in a div to ensure the motion.div from DealCard behaves well in the grid */}
                                    <div className="w-full">
                                        <DealCard deal={deal} index={i} />
                                    </div>
                                </div>
                            </FadeInUp>
                        ))}
                    </div>
                ) : (
                    <div className="py-20 text-center space-y-4">
                        <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto">
                            <Sparkles className="w-8 h-8 text-slate-300" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white">No active deals found</h3>
                        <p className="text-slate-500 dark:text-slate-400">
                            Check back soon for new exclusive travel offers.
                        </p>
                    </div>
                )}
            </div>
        </main>
    );
}
