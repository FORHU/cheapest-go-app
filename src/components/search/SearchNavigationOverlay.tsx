"use client";

import { useSearchStore } from '@/stores/searchStore';
import { SearchLoadingSkeleton } from './SearchLoadingSkeleton';

/**
 * Full-page overlay that shows SearchLoadingSkeleton as soon as any
 * navigation to /search is initiated (e.g. landing-page card clicks).
 * Lives in the root layout so it fires regardless of which page the user
 * is coming from.  isSearching is reset by useSearchModule on the search
 * page once it mounts.
 */
export function SearchNavigationOverlay() {
    const isSearching = useSearchStore((s) => s.isSearching);
    if (!isSearching) return null;
    return (
        <div className="fixed inset-0 z-50 bg-white dark:bg-slate-950 overflow-y-auto">
            <SearchLoadingSkeleton />
        </div>
    );
}
