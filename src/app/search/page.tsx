import React from 'react';
import { Header, Footer } from '@/components/landing';
import SearchFilters from '@/components/search/SearchFilters';
import SearchResults from '@/components/search/SearchResults';
import { SearchModule } from '@/components/landing/hero/SearchModule';
import BackButton from '@/components/common/BackButton';

export const metadata = {
    title: 'Search Results - AeroVantage',
    description: 'Find your perfect stay.',
};

export default function SearchPage() {
    return (
        <>
            <Header />

            <main className="min-h-screen pt-6 pb-20 px-4 md:px-6">
                <div className="max-w-7xl mx-auto">
                    {/* Back to Home */}
                    <div className="mb-4">
                        <BackButton label="Back to Home" href="/" />
                    </div>

                    {/* Compact Search Bar for Results Page */}
                    <div className="mb-8 relative z-50">
                        {/* Note: We reuse the SearchModule but might want a more compact version in the future. 
                     For now, we can wrap it or style it to fit. To keep it expeda-like, it's usually at the top. */}
                        <div className="origin-top transform scale-90 sm:scale-100">
                            <SearchModule />
                        </div>
                    </div>
                </div>

                <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-8">
                    <SearchFilters />
                    <SearchResults />
                </div>
            </main>

            <Footer />
        </>
    );
}
