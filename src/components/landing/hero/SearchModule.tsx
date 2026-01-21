"use client";

import React from 'react';
import { MapPin, Calendar, User, ChevronDown } from 'lucide-react';
import { DestinationPicker, DatePicker, TravelersPicker } from './search';
import { useSearchModule } from '@/hooks/useSearchModule';
import { MagneticButton } from '@/components/ui';

export const SearchModule: React.FC = () => {
    const {
        // State
        destinationQuery,
        destination,
        checkIn,
        checkOut,
        flexibility,
        adults,
        children,
        rooms,
        totalTravelers,
        recentSearches,

        // UI State
        isDestinationOpen,
        isDatePickerOpen,
        isTravelersOpen,

        // Actions
        setDestinationQuery,
        selectDestination,
        setCheckIn,
        setCheckOut,
        setFlexibility,
        setAdults,
        setChildren,
        setRooms,

        // UI Actions
        openDestination,
        closeDestination,
        openDatePicker,
        closeDatePicker,
        openTravelers,
        closeTravelers,

        // Search
        handleSearch,
        clearRecentSearch,
    } = useSearchModule();

    // Format dates for display
    const formatDateRange = () => {
        if (!checkIn && !checkOut) return 'Select dates';
        const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
        const checkInStr = checkIn ? checkIn.toLocaleDateString('en-US', options) : 'Start';
        const checkOutStr = checkOut ? checkOut.toLocaleDateString('en-US', options) : 'End';
        return `${checkInStr} — ${checkOutStr}`;
    };

    // Format travelers for display
    const formatTravelers = () => {
        const parts = [];
        parts.push(`${totalTravelers} ${totalTravelers === 1 ? 'Guest' : 'Guests'}`);
        if (rooms > 1) parts.push(`${rooms} Rooms`);
        return parts.join(', ');
    };

    return (
        <div className="relative bg-white/60 dark:bg-[#0f172a]/80 backdrop-blur-3xl rounded-xl shadow-2xl dark:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] border border-white/20 dark:border-white/10 p-2 flex flex-col lg:flex-row gap-2">
            {/* Main Inputs Container */}
            <div className="flex-[4] flex flex-col sm:flex-row bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-white/5 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-white/5">

                {/* Destination */}
                <div
                    className="flex-1 relative flex items-center px-4 h-16 group cursor-pointer"
                    onClick={openDestination}
                >
                    <MapPin className="text-slate-400 group-hover:text-alabaster-accent dark:group-hover:text-obsidian-accent transition-colors shrink-0" size={20} />
                    <div className="ml-3 flex flex-col justify-center w-full text-left">
                        <label className="text-[10px] uppercase font-mono text-slate-500 font-medium tracking-wider">
                            Where to?
                        </label>
                        <div className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[150px]">
                            {destination?.title || destinationQuery || 'Search destination'}
                        </div>
                    </div>

                    <DestinationPicker
                        isOpen={isDestinationOpen}
                        query={destinationQuery}
                        recentSearches={recentSearches}
                        onQueryChange={setDestinationQuery}
                        onSelect={selectDestination}
                        onClose={closeDestination}
                        onClearRecent={clearRecentSearch}
                    />
                </div>

                {/* Dates */}
                <div
                    className="flex-1 relative flex items-center px-4 h-16 group cursor-pointer"
                    onClick={openDatePicker}
                >
                    <Calendar className="text-slate-400 group-hover:text-alabaster-accent dark:group-hover:text-obsidian-accent transition-colors shrink-0" size={20} />
                    <div className="ml-3 flex flex-col justify-center w-full text-left">
                        <label className="text-[10px] uppercase font-mono text-slate-500 font-medium tracking-wider">
                            Dates
                        </label>
                        <div className="text-sm font-bold text-slate-900 dark:text-white">
                            {formatDateRange()}
                        </div>
                    </div>

                    <DatePicker
                        isOpen={isDatePickerOpen}
                        checkIn={checkIn}
                        checkOut={checkOut}
                        flexibility={flexibility}
                        onCheckInChange={setCheckIn}
                        onCheckOutChange={setCheckOut}
                        onFlexibilityChange={setFlexibility}
                        onClose={closeDatePicker}
                    />
                </div>

                {/* Travelers */}
                <div
                    className="flex-1 relative flex items-center px-4 h-16 group cursor-pointer"
                    onClick={openTravelers}
                >
                    <User className="text-slate-400 group-hover:text-alabaster-accent dark:group-hover:text-obsidian-accent transition-colors shrink-0" size={20} />
                    <div className="ml-3 flex flex-col justify-center w-full text-left">
                        <label className="text-[10px] uppercase font-mono text-slate-500 font-medium tracking-wider">
                            Travelers
                        </label>
                        <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                            {formatTravelers()}
                        </div>
                    </div>
                    <ChevronDown className="absolute right-4 text-slate-400 transition-transform duration-200" size={14} style={{ transform: isTravelersOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />

                    <TravelersPicker
                        isOpen={isTravelersOpen}
                        adults={adults}
                        children={children}
                        rooms={rooms}
                        onAdultsChange={setAdults}
                        onChildrenChange={setChildren}
                        onRoomsChange={setRooms}
                        onClose={closeTravelers}
                    />
                </div>
            </div>

            {/* Search Button */}
            <MagneticButton onClick={handleSearch} />
        </div>
    );
};

export default SearchModule;
