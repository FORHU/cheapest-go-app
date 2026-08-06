"use client";

import { useEffect } from 'react';
import { useSearchStore } from '@/stores/searchStore';
import { SearchLoadingSkeleton } from './SearchLoadingSkeleton';
import { FlightSearchLoadingSkeleton } from '@/components/flights/FlightSearchLoadingSkeleton';

/**
 * Full-page overlay shown from the moment a search is initiated until the
 * destination results client mounts and clears `isSearching`.
 *
 * It covers the gap that route-level `loading.tsx` cannot: the time between the
 * click and Next.js beginning the transition. Both must exist, and both must
 * show the RIGHT skeleton — this used to render the hotel skeleton for flight
 * searches too, so a flight search flashed a hotel layout before the landing
 * skeleton before the results.
 */

/**
 * Safety net. `isSearching` is cleared by whichever results client mounts, so a
 * navigation that never completes — an error page, a cancelled transition, a
 * back button mid-flight — would otherwise leave the overlay covering the app
 * forever. Long enough not to fire during a slow-but-working search (the flights
 * client allows 45s before it gives up), short enough to self-heal.
 */
const OVERLAY_MAX_MS = 60_000;

export function SearchNavigationOverlay() {
    const isSearching = useSearchStore((s) => s.isSearching);
    const searchMode = useSearchStore((s) => s.searchMode);
    const setIsSearching = useSearchStore((s) => s.setIsSearching);

    useEffect(() => {
        if (!isSearching) return;
        const id = setTimeout(() => {
            console.warn('[SearchNavigationOverlay] cleared by safety timeout — navigation did not complete');
            setIsSearching(false);
        }, OVERLAY_MAX_MS);
        return () => clearTimeout(id);
    }, [isSearching, setIsSearching]);

    if (!isSearching) return null;

    return (
        <div className="fixed inset-0 z-50 bg-white dark:bg-slate-950 overflow-y-auto">
            {searchMode === 'flights' ? <FlightSearchLoadingSkeleton /> : <SearchLoadingSkeleton />}
        </div>
    );
}
