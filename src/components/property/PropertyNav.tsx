"use client";

import { useState, useEffect } from 'react';

interface NavTab {
    label: string;
    sectionId: string;
}

const tabs: NavTab[] = [
    { label: 'Overview', sectionId: 'overview-section' },
    { label: 'Rooms', sectionId: 'room-list-section' },
    { label: 'Location', sectionId: 'location' },
    { label: 'Amenities', sectionId: 'amenities-section' },
    { label: 'Policies', sectionId: 'policies' },
    { label: 'Reviews', sectionId: 'reviews-section' },
];

export default function PropertyNav() {
    const [activeTab, setActiveTab] = useState('overview-section');

    // Scroll to section when tab is clicked — let the scroll listener
    // determine active state after scroll completes (single source of truth)
    const handleTabClick = (sectionId: string) => {
        const section = document.getElementById(sectionId);
        if (section) {
            const navHeight = window.innerWidth < 768 ? 100 : 140;
            const sectionTop = section.getBoundingClientRect().top + window.scrollY - navHeight;
            window.scrollTo({ top: sectionTop, behavior: 'smooth' });
        }
    };

    // Update active tab based on scroll position
    useEffect(() => {
        const handleScroll = () => {
            const navHeight = window.innerWidth < 768 ? 110 : 150;

            // Find the section that's currently in view
            for (let i = tabs.length - 1; i >= 0; i--) {
                const section = document.getElementById(tabs[i].sectionId);
                if (section) {
                    const rect = section.getBoundingClientRect();
                    if (rect.top <= navHeight) {
                        setActiveTab(tabs[i].sectionId);
                        break;
                    }
                }
            }
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <div className="sticky top-[64px] md:top-[80px] bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg z-30 py-1.5 md:py-3 border-b border-slate-200 dark:border-white/10 -mx-3 px-3 md:-mx-6 md:px-6">
            <div className="flex gap-1.5 md:gap-2 overflow-x-auto no-scrollbar">
                {tabs.map((tab) => (
                    <button
                        key={tab.sectionId}
                        onClick={() => handleTabClick(tab.sectionId)}
                        className={`px-2.5 lg:px-4 py-1.5 lg:py-2 text-[11px] lg:text-base font-semibold rounded-full transition-all whitespace-nowrap ${activeTab === tab.sectionId
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5'
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
