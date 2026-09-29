"use client";

import { useSearchStore } from '@/stores/searchStore';
import { SearchLoadingSkeleton } from './SearchLoadingSkeleton';
import { FlightSearchSkeleton } from '@/components/flights/FlightSearchSkeleton';

/**
 * Full-page overlay that shows a results skeleton as soon as a search
 * navigation starts (e.g. landing-page card clicks, the search bar).
 * Lives in the root layout so it fires regardless of which page the user
 * is coming from. The skeleton is the one for the page being navigated
 * to — a flight search gets the flight results layout, not the hotel
 * list's. isSearching is reset by the search page (or the search hook)
 * once the results page has taken over.
 */
export function SearchNavigationOverlay() {
    const isSearching = useSearchStore((s) => s.isSearching);
    const kind = useSearchStore((s) => s.searchingKind);
    if (!isSearching) return null;
    if (kind === 'flights') {
        // Below the sticky site header (44px, 56px from md, plus its 1px rule)
        // rather than under it, on the page's own grid ground — so the skeleton
        // sits exactly where the results page will draw.
        return (
            <div className="fixed inset-x-0 bottom-0 top-[45px] md:top-[57px] z-50 overflow-y-auto bg-alabaster dark:bg-obsidian bg-grid-alabaster dark:bg-grid-obsidian">
                <FlightSearchSkeleton />
            </div>
        );
    }
    return (
        <div className="fixed inset-0 z-50 bg-white dark:bg-slate-950 overflow-y-auto">
            <SearchLoadingSkeleton />
        </div>
    );
}
