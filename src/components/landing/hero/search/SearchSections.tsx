"use client";

import React from 'react';
import { MapPin, Calendar, User, ChevronDown } from 'lucide-react';
import { useSearchStore, useDestination, useDestinationQuery, useDates, useTravelers, useActiveDropdown } from '@/stores/searchStore';
import { DestinationPicker } from './DestinationPicker';
import { DatePicker } from './DatePicker';
import { TravelersPicker } from './TravelersPicker';

export const DestinationSection: React.FC = () => {
    const { setActiveDropdown } = useSearchStore();
    const destination = useDestination();
    const query = useDestinationQuery();

    return (
        <div
            className="flex-1 relative flex items-center px-4 h-16 group cursor-pointer"
            onClick={() => setActiveDropdown('destination')}
        >
            <MapPin className="text-slate-400 group-hover:text-alabaster-accent dark:group-hover:text-obsidian-accent transition-colors shrink-0" size={20} />
            <div className="ml-3 flex flex-col justify-center w-full text-left">
                <label className="text-[10px] uppercase font-mono text-slate-500 font-medium tracking-wider">
                    Where to?
                </label>
                <div className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[150px]">
                    {destination?.title || query || 'Search destination'}
                </div>
            </div>
            <DestinationPicker />
        </div>
    );
};

export const DateSection: React.FC = () => {
    const { setActiveDropdown } = useSearchStore();
    const { checkIn, checkOut } = useDates();

    const formatDateRange = () => {
        if (!checkIn && !checkOut) return 'Select dates';
        const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
        const checkInStr = checkIn ? new Date(checkIn).toLocaleDateString('en-US', options) : 'Start';
        const checkOutStr = checkOut ? new Date(checkOut).toLocaleDateString('en-US', options) : 'End';
        return `${checkInStr} — ${checkOutStr}`;
    };

    return (
        <div
            className="flex-1 relative flex items-center px-4 h-16 group cursor-pointer"
            onClick={() => setActiveDropdown('dates')}
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
            <DatePicker />
        </div>
    );
};

export const TravelersSection: React.FC = () => {
    const { setActiveDropdown } = useSearchStore();
    const { adults, children, rooms } = useTravelers();
    const activeDropdown = useActiveDropdown();

    const totalTravelers = adults + children;
    const isTravelersOpen = activeDropdown === 'travelers';

    const formatTravelers = () => {
        const parts = [];
        parts.push(`${totalTravelers} ${totalTravelers === 1 ? 'Guest' : 'Guests'}`);
        if (rooms > 1) parts.push(`${rooms} Rooms`);
        return parts.join(', ');
    };

    return (
        <div
            className="flex-1 relative flex items-center px-4 h-16 group cursor-pointer z-20"
            onClick={() => setActiveDropdown(isTravelersOpen ? null : 'travelers')}
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
            <ChevronDown
                className="absolute right-4 text-slate-400 transition-transform duration-200"
                size={14}
                style={{ transform: isTravelersOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
            <TravelersPicker />
        </div>
    );
};
