"use client";

import React, { Suspense } from 'react';
import { MagneticButton } from '@/components/ui';
import { DestinationSection, DateSection, TravelersSection } from './search/SearchSections';
import { useSearchModule } from '@/hooks';

const SearchModuleContent: React.FC = () => {
    // All logic is extracted to the custom hook
    const { handleSearch, isSearching } = useSearchModule();

    return (
        <div className="relative bg-white dark:bg-[#0f172a] rounded-xl shadow-2xl dark:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] border border-transparent p-2 flex flex-col lg:flex-row gap-2">
            {/* Main Inputs Container */}
            <div className="flex-[4] flex flex-col sm:flex-row bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-white/5 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-white/5">
                <DestinationSection />
                <DateSection />
                <TravelersSection />
            </div>

            {/* Search Button */}
            <MagneticButton onClick={handleSearch} isLoading={isSearching} />
        </div>
    );
};

// Suspense wrapper for SearchModule
export const SearchModule: React.FC = () => {
    return (
        <Suspense fallback={
            <div className="relative bg-white dark:bg-[#0f172a] rounded-xl shadow-2xl border border-transparent p-2 h-[72px] animate-pulse" />
        }>
            <SearchModuleContent />
        </Suspense>
    );
};

export default SearchModule;
