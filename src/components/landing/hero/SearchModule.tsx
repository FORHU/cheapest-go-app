"use client";

import React, { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSearchStore } from '@/stores/searchStore';
import { MagneticButton } from '@/components/ui';
import { DestinationSection, DateSection, TravelersSection } from './search/SearchSections';

export const SearchModule: React.FC = () => {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Store actions
    const { setDestination, setDestinationQuery, setDates, setTravelers } = useSearchStore();

    // Sync URL params to Store on mount (for page reloads/sharing)
    useEffect(() => {
        const destParam = searchParams.get('destination');
        const checkInParam = searchParams.get('checkIn');
        const checkOutParam = searchParams.get('checkOut');
        const adultsParam = searchParams.get('adults');
        const childrenParam = searchParams.get('children');
        const roomsParam = searchParams.get('rooms');

        if (destParam) {
            setDestinationQuery(destParam);
            // We reconstruct a partial destination object so it displays nicer
            setDestination({
                type: 'city',
                title: destParam,
                subtitle: 'Selected destination'
            });
        }

        if (checkInParam || checkOutParam) {
            setDates({
                checkIn: checkInParam ? new Date(checkInParam) : null,
                checkOut: checkOutParam ? new Date(checkOutParam) : null
            });
        }

        if (adultsParam || childrenParam || roomsParam) {
            setTravelers({
                adults: adultsParam ? parseInt(adultsParam) : 2,
                children: childrenParam ? parseInt(childrenParam) : 0,
                rooms: roomsParam ? parseInt(roomsParam) : 1
            });
        }
    }, [searchParams, setDestination, setDestinationQuery, setDates, setTravelers]);

    const handleSearch = () => {
        const state = useSearchStore.getState();
        state.setActiveDropdown(null);

        const params = new URLSearchParams();
        // Use query if destination object is missing but user typed something
        const destValue = state.destination?.title || state.destinationQuery;

        if (destValue) {
            params.set('destination', destValue);
        }
        if (state.dates.checkIn) {
            params.set('checkIn', state.dates.checkIn.toISOString());
        }
        if (state.dates.checkOut) {
            params.set('checkOut', state.dates.checkOut.toISOString());
        }
        params.set('adults', state.travelers.adults.toString());
        params.set('children', state.travelers.children.toString());
        params.set('rooms', state.travelers.rooms.toString());

        router.push(`/search?${params.toString()}`);
    };

    return (
        <div className="relative bg-white/60 dark:bg-[#0f172a]/80 backdrop-blur-3xl rounded-xl shadow-2xl dark:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] border border-white/20 dark:border-white/10 p-2 flex flex-col lg:flex-row gap-2">
            {/* Main Inputs Container */}
            <div className="flex-[4] flex flex-col sm:flex-row bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-white/5 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-white/5">
                <DestinationSection />
                <DateSection />
                <TravelersSection />
            </div>

            {/* Search Button */}
            <MagneticButton onClick={handleSearch} />
        </div>
    );
};

export default SearchModule;
