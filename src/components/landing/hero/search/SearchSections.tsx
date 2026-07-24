"use client";

import React, { useRef, useEffect } from 'react';
import { MapPin, Calendar, User, ChevronDown } from 'lucide-react';
import { useSearchStore, useDestination, useDestinationQuery, useDates, useTravelers, useActiveDropdown } from '@/stores/searchStore';
import { DestinationPicker } from './DestinationPicker';
import { DatePicker } from './DatePicker';
import { TravelersPicker } from './TravelersPicker';
import { useTranslations, useLocale } from 'next-intl';

export const DestinationSection: React.FC = () => {
    const t = useTranslations('landing.search');
    const { setActiveDropdown, setDestinationQuery } = useSearchStore();
    const destination = useDestination();
    const query = useDestinationQuery();
    const activeDropdown = useActiveDropdown();
    const isOpen = activeDropdown === 'destination';

    const sectionRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus the inline input when the section opens.
    useEffect(() => {
        if (isOpen) inputRef.current?.focus();
    }, [isOpen]);

    // Close when clicking outside the whole section (cell input + suggestions dropdown).
    // The section wrapper contains both, so DestinationPicker skips its own handler.
    useEffect(() => {
        if (!isOpen) return;
        const onMouseDown = (e: MouseEvent) => {
            if (sectionRef.current && !sectionRef.current.contains(e.target as Node)) {
                setActiveDropdown(null);
            }
        };
        document.addEventListener('mousedown', onMouseDown);
        return () => document.removeEventListener('mousedown', onMouseDown);
    }, [isOpen, setActiveDropdown]);

    return (
        <div ref={sectionRef} className="flex-1 min-w-0 relative h-16 group">
            <div
                className="w-full h-full flex items-center px-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                onClick={() => setActiveDropdown('destination')}
            >
                <MapPin className="text-slate-400 group-hover:text-alabaster-accent dark:group-hover:text-obsidian-accent transition-colors shrink-0" size={20} />
                <div className="ml-3 flex flex-col justify-center w-full text-left min-w-0">
                    <label className="text-ui-label">
                        {t('whereTo')}
                    </label>
                    {isOpen ? (
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={(e) => setDestinationQuery(e.target.value)}
                            onFocus={(e) => e.target.select()}
                            onClick={(e) => e.stopPropagation()}
                            placeholder={t('searchDestinationsPlaceholder')}
                            className="text-ui-value bg-transparent border-none p-0 outline-none focus:ring-0 w-full max-w-[150px] truncate text-slate-900 dark:text-white placeholder:font-normal placeholder-slate-400"
                            autoComplete="off"
                            spellCheck={false}
                        />
                    ) : (
                        <div className="text-ui-value truncate max-w-[150px]">
                            {destination?.title || query || t('searchDestination')}
                        </div>
                    )}
                </div>
            </div>
            <DestinationPicker hideInput />
        </div>
    );

};

export const CheckInSection: React.FC = () => {
    const t = useTranslations('landing.search');
    const locale = useLocale();
    const { setActiveDropdown } = useSearchStore();
    const { checkIn } = useDates();

    const formatDate = (date: Date | null) => {
        if (!date) return t('selectDate');
        return new Date(date).toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
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
                        {t('checkIn')}
                    </label>
                    <div className="text-ui-value truncate">
                        {formatDate(checkIn)}
                    </div>
                </div>
            </div>
            <DatePicker triggerDropdown="dates-in" />
        </div>
    );
};

export const CheckOutSection: React.FC = () => {
    const t = useTranslations('landing.search');
    const locale = useLocale();
    const { setActiveDropdown } = useSearchStore();
    const { checkOut } = useDates();

    const formatDate = (date: Date | null) => {
        if (!date) return t('selectDate');
        return new Date(date).toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
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
                        {t('checkOut')}
                    </label>
                    <div className="text-ui-value truncate">
                        {formatDate(checkOut)}
                    </div>
                </div>
            </div>
            <DatePicker initialCheckOutMode triggerDropdown="dates-out" />
        </div>
    );
};

export const TravelersSection: React.FC = () => {
    const t = useTranslations('landing.search');
    const { setActiveDropdown } = useSearchStore();
    const { adults, children } = useTravelers();
    const activeDropdown = useActiveDropdown();

    const totalTravelers = adults + children;
    const isTravelersOpen = activeDropdown === 'travelers';

    const formatTravelers = () => {
        const total = totalTravelers;
        return total === 1 ? t('guest', { count: total }) : t('guestPlural', { count: total });
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
                        {t('travelers')}
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
