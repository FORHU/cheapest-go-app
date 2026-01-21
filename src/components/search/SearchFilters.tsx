"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Map } from 'lucide-react';

const FilterSection = ({ title, children, defaultExpanded = true, index = 0 }: { title: string, children: React.ReactNode, defaultExpanded?: boolean, index?: number }) => (
    <motion.div
        initial={{ opacity: 0, x: -20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: false, amount: 0.3 }}
        transition={{ delay: index * 0.05, duration: 0.4 }}
        className="border-b border-slate-200 dark:border-white/5 py-4 last:border-0"
    >
        <h4 className="font-semibold text-sm text-slate-900 dark:text-white mb-3">{title}</h4>
        <div className="space-y-2">
            {children}
        </div>
    </motion.div>
);

const CheckboxItem = ({ label, count }: { label: string, count?: number }) => (
    <label className="flex items-center gap-3 cursor-pointer group mb-2 last:mb-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 -mx-2 px-2 py-1 rounded transition-colors">
        <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
        <span className="text-sm text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors flex-1">{label}</span>
        {count !== undefined && <span className="text-xs text-slate-400">({count})</span>}
    </label>
);

const RadioItem = ({ name, label, count }: { name: string, label: string, count?: number }) => (
    <label className="flex items-center gap-3 cursor-pointer group mb-2 last:mb-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 -mx-2 px-2 py-1 rounded transition-colors">
        <input type="radio" name={name} className="w-4 h-4 border-slate-300 text-blue-600 focus:ring-blue-500" />
        <span className="text-sm text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors flex-1">{label}</span>
        {count !== undefined && <span className="text-xs text-slate-400">({count})</span>}
    </label>
);

const SearchFilters = () => {
    return (
        <div className="w-full flex-shrink-0 lg:w-[280px] space-y-4">
            {/* Map Preview */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: false, amount: 0.3 }}
                transition={{ duration: 0.5 }}
                className="relative h-32 w-full rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 group cursor-pointer mb-6"
            >
                <div className="absolute inset-0 bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                    <Map className="text-slate-400" />
                </div>
                {/* Mock map image would go here */}
                <button className="absolute inset-0 m-auto w-max h-max bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg border border-slate-200 dark:border-white/10 opacity-90 hover:opacity-100 hover:scale-105 transition-all">
                    View on map
                </button>
            </motion.div>

            {/* Helper Text */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: false, amount: 0.5 }}
                transition={{ duration: 0.4 }}
                className="pb-4 border-b border-slate-200 dark:border-slate-800"
            >
                <h3 className="font-display font-bold text-slate-900 dark:text-white mb-1">Filter by</h3>
            </motion.div>

            {/* Search by Property Name */}
            <div className="py-4 border-b border-slate-200 dark:border-slate-800">
                <h4 className="font-semibold text-sm text-slate-900 dark:text-white mb-3">Search by property name</h4>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                        type="text"
                        placeholder="e.g. Marriott"
                        className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                </div>
            </div>

            {/* Popular Filters */}
            <FilterSection title="Popular filters">
                <CheckboxItem label="Breakfast included" count={438} />
                <CheckboxItem label="Pool" count={165} />
                <CheckboxItem label="Free WiFi" count={1275} />
                <CheckboxItem label="Spa" count={64} />
                <CheckboxItem label="Pet friendly" count={79} />
            </FilterSection>

            {/* Price Per Night */}
            <FilterSection title="Price per night">
                <div className="space-y-4 p-2">
                    <div className="h-1 bg-slate-200 dark:bg-slate-700 rounded-full relative mt-2">
                        <div className="absolute left-0 w-1/2 h-full bg-blue-600 rounded-full"></div>
                        <div className="absolute left-1/2 w-4 h-4 -mt-1.5 -ml-2 bg-white border-2 border-blue-600 rounded-full shadow cursor-pointer"></div>
                        <div className="absolute left-0 w-4 h-4 -mt-1.5 bg-white border-2 border-slate-300 rounded-full shadow cursor-pointer"></div>
                    </div>
                    <div className="flex items-center gap-2 mt-4">
                        <div className="flex-1 p-2 border border-slate-300 dark:border-slate-700 rounded text-center">
                            <div className="text-[10px] text-slate-400 uppercase">Min</div>
                            <div className="text-sm font-semibold">₱0</div>
                        </div>
                        <div className="text-slate-400">-</div>
                        <div className="flex-1 p-2 border border-slate-300 dark:border-slate-700 rounded text-center">
                            <div className="text-sm font-semibold">₱50k+</div>
                            <div className="text-[10px] text-slate-400 uppercase">Max</div>
                        </div>
                    </div>
                </div>
            </FilterSection>

            {/* Star Rating */}
            <FilterSection title="Star rating">
                <div className="flex flex-col gap-1">
                    <CheckboxItem label="5 stars" count={48} />
                    <CheckboxItem label="4 stars" count={148} />
                    <CheckboxItem label="3 stars" count={541} />
                    <CheckboxItem label="2 stars" count={22} />
                    <CheckboxItem label="1 star" count={5} />
                </div>
            </FilterSection>

            {/* Guest Rating */}
            <FilterSection title="Guest rating">
                <RadioItem name="rating" label="Any" />
                <RadioItem name="rating" label="Wonderful 9+" count={283} />
                <RadioItem name="rating" label="Very good 8+" count={764} />
                <RadioItem name="rating" label="Good 7+" count={1034} />
            </FilterSection>

            {/* Payment Type */}
            <FilterSection title="Payment type">
                <CheckboxItem label="Fully refundable" count={892} />
                <CheckboxItem label="Reserve now, pay later" count={654} />
            </FilterSection>

            {/* Property Type */}
            <FilterSection title="Property type">
                <CheckboxItem label="Hotel" count={986} />
                <CheckboxItem label="Apart-hotel" count={25} />
                <CheckboxItem label="Resort" count={12} />
                <CheckboxItem label="Guesthouse" count={87} />
                <CheckboxItem label="Hostel" count={45} />
            </FilterSection>

            {/* Neighborhood */}
            <FilterSection title="Neighborhood">
                <RadioItem name="hood" label="Session Road Area" count={150} />
                <RadioItem name="hood" label="Burnham Park" count={89} />
                <RadioItem name="hood" label="Camp John Hay" count={45} />
                <RadioItem name="hood" label="Mines View Park" count={32} />
                <button className="text-blue-600 text-sm hover:underline mt-2 flex items-center gap-1">
                    See more
                </button>
            </FilterSection>

            {/* Amenities */}
            <FilterSection title="Amenities">
                <CheckboxItem label="Ocean view" count={12} />
                <CheckboxItem label="Mountain view" count={156} />
                <CheckboxItem label="Balcony" count={342} />
                <CheckboxItem label="Air conditioning" count={1119} />
                <CheckboxItem label="Washer and dryer" count={45} />
                <CheckboxItem label="Kitchen" count={329} />
                <button className="text-blue-600 text-sm hover:underline mt-2 flex items-center gap-1">
                    See more
                </button>
            </FilterSection>

            {/* Accessibility */}
            <FilterSection title="Accessibility">
                <CheckboxItem label="Wheelchair accessible" count={120} />
                <CheckboxItem label="Elevator" count={791} />
                <CheckboxItem label="Accessible bathroom" count={122} />
                <CheckboxItem label="In-room accessibility" count={85} />
            </FilterSection>

            {/* Traveler Experience */}
            <FilterSection title="Traveler experience">
                <CheckboxItem label="Business friendly" count={293} />
                <CheckboxItem label="Family friendly" count={412} />
                <CheckboxItem label="LGBTQ+ welcoming" count={16} />
            </FilterSection>
        </div >
    );
};

export default SearchFilters;
