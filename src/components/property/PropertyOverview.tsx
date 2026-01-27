"use client";

import React from 'react';
import { Star, MapPin, Wifi, Car, Utensils, Coffee, Check } from 'lucide-react';
import { Property } from '@/data/mockProperties';

const PropertyOverview: React.FC<{ property: Property }> = ({ property }) => {
    return (
        <div className="space-y-8">
            {/* Header Info */}
            <div>
                <h1 className="text-3xl font-display font-bold text-slate-900 dark:text-white mb-2">
                    {property.name}
                </h1>
                <div className="flex flex-wrap items-center gap-4 text-sm mb-4">
                    <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((s) => (
                            <Star key={s} size={14} className="fill-current text-slate-900 dark:text-white" />
                        ))}
                    </div>
                    <div className="text-slate-500 dark:text-slate-400">
                        {property.location}
                    </div>
                </div>

                <div className="flex items-start gap-4 p-4 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/10">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-lg text-sm font-bold text-white shrink-0
                            ${property.rating >= 9 ? 'bg-blue-600' : property.rating >= 8 ? 'bg-emerald-500' : 'bg-slate-500'}`}>
                        {property.rating}
                    </div>
                    <div>
                        <div className="font-exrta-bold text-slate-900 dark:text-white flex items-center gap-2">
                            {property.rating >= 9 ? 'Exceptional' : property.rating >= 8 ? 'Excellent' : 'Very Good'}
                            <span className="text-xs font-normal text-slate-500 px-2 py-0.5 bg-white dark:bg-slate-800 rounded-full border border-slate-200 dark:border-white/10">VIP Access</span>
                        </div>
                        <div className="text-sm text-slate-600 dark:text-slate-300">
                            {property.reviews.toLocaleString()} verified reviews
                        </div>
                        <a href="#" className="text-xs text-blue-600 hover:underline mt-1 block">
                            See all reviews
                        </a>
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-8">
                <div className="w-full">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">About this property</h2>
                    <div className="text-sm text-slate-700 dark:text-slate-300 space-y-4 leading-relaxed">
                        <p>{property.description}</p>
                    </div>
                </div>

                {/* Popular amenities - Full width grid */}
                <div className="w-full">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4">Popular amenities</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {property.amenities.map((amenity, i) => (
                            <div key={i} className="flex items-center text-sm text-slate-700 dark:text-slate-300">
                                {amenity === 'Free WiFi' && <Wifi size={18} className="mr-3 shrink-0" />}
                                {amenity === 'Parking' && <Car size={18} className="mr-3 shrink-0" />}
                                {amenity === 'Restaurant' && <Utensils size={18} className="mr-3 shrink-0" />}
                                {amenity === 'Breakfast included' && <Coffee size={18} className="mr-3 shrink-0" />}
                                {!['Free WiFi', 'Parking', 'Restaurant', 'Breakfast included'].includes(amenity) && <Check size={18} className="mr-3 text-emerald-500 shrink-0" />}
                                {amenity}
                            </div>
                        ))}
                    </div>
                    <button className="text-blue-600 text-sm font-medium hover:underline mt-4">See all amenities</button>
                </div>
            </div>

            {/* Cleaning & Safety - Condensed */}
            <div className="bg-emerald-50 dark:bg-emerald-900/10 p-4 rounded-xl flex gap-3 text-sm">
                <Check size={20} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                    <span className="font-bold text-emerald-900 dark:text-emerald-200">Cleaning and safety practices</span>
                    <p className="text-emerald-800 dark:text-emerald-300 mt-1">
                        This property has extensive hygiene measures in place, including contactless check-in and enhanced cleaning protocols.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default PropertyOverview;
