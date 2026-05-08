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
        <div className="flex-1 min-w-0 relative h-16 group">
            <div
                className="w-full h-full flex items-center px-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                onClick={() => setActiveDropdown('destination')}
            >
                <MapPin className="text-slate-400 group-hover:text-alabaster-accent dark:group-hover:text-obsidian-accent transition-colors shrink-0" size={20} />
                <div className="ml-3 flex flex-col justify-center w-full text-left min-w-0">
                    <label className="text-ui-label">
                        Where to?
                    </label>
                    <div className="text-ui-value truncate max-w-[150px]">
                        {destination?.title || query || 'Search destination'}
                    </div>
                </div>
            </div>
            <DestinationPicker />
        </div>
    );

};

export const CheckInSection: React.FC = () => {
    const { setActiveDropdown } = useSearchStore();
    const { checkIn } = useDates();

    const formatDate = (date: Date | null) => {
        if (!date) return 'Select date';
        return new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    };

    return (
        <div className="flex-1 min-w-0 relative h-16 group">
            <div
                className="w-full h-full flex items-center px-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                onClick={() => setActiveDropdown('dates-in')}
                data-datepicker-trigger
            >
                <Calendar className="text-slate-400 group-hover:text-blue-600 transition-colors shrink-0" size={20} />
                <div className="ml-3 flex flex-col justify-center w-full text-left min-w-0">
                    <label className="text-ui-label">
                        Check-in
                    </label>
                    <div className="text-ui-value truncate">
                        {formatDate(checkIn)}
                    </div>
                </div>
            </div>
            <DatePicker />
        </div>
    );
};

export const CheckOutSection: React.FC = () => {
    const { setActiveDropdown } = useSearchStore();
    const { checkOut } = useDates();

    const formatDate = (date: Date | null) => {
        if (!date) return 'Select date';
        return new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    };

    return (
        <div className="flex-1 min-w-0 relative h-16 group">
            <div
                className="w-full h-full flex items-center px-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                onClick={() => setActiveDropdown('dates-out')}
                data-datepicker-trigger
            >
                <Calendar className="text-slate-400 group-hover:text-blue-600 transition-colors shrink-0" size={20} />
                <div className="ml-3 flex flex-col justify-center w-full text-left min-w-0">
                    <label className="text-ui-label">
                        Check-out
                    </label>
                    <div className="text-ui-value truncate">
                        {formatDate(checkOut)}
                    </div>
                </div>
            </div>
            <DatePicker initialCheckOutMode />
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
        <div className="flex-1 min-w-0 relative h-16 group z-20">
            <div
                className="w-full h-full flex items-center px-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                onClick={() => setActiveDropdown(isTravelersOpen ? null : 'travelers')}
            >
                <User className="text-slate-400 group-hover:text-alabaster-accent dark:group-hover:text-obsidian-accent transition-colors shrink-0" size={20} />
                <div className="ml-3 flex flex-col justify-center w-full text-left min-w-0">
                    <label className="text-ui-label">
                        Travelers
                    </label>
                    <div className="text-ui-value truncate pr-6">
                        {formatTravelers()}
                    </div>
                </div>
                <ChevronDown
                    className="absolute right-4 text-slate-400 transition-transform duration-200"
                    size={14}
                    style={{ transform: isTravelersOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                />
            </div>
            <TravelersPicker />
        </div>
    );

};
