"use client";

import React from 'react';
import { MapPin, Train, Plane } from 'lucide-react';

const LocationSection = () => {
    return (
        <div className="py-8 border-t border-slate-200 dark:border-white/10" id="location">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Explore the area</h2>
            <div className="flex flex-col md:flex-row gap-8">
                {/* Map Preview */}
                <div className="flex-1 h-[240px] bg-slate-100 dark:bg-slate-800 rounded-xl relative overflow-hidden group cursor-pointer">
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-200 dark:bg-slate-700">
                        <span className="text-slate-400">Map View Mockup</span>
                    </div>
                    {/* Placeholder for map image */}
                    <img
                        src="https://via.placeholder.com/600x400?text=Map+View"
                        alt="Map view"
                        className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:opacity-60 transition-opacity"
                    />
                    <button className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm font-bold px-4 py-2 rounded-full shadow-lg border border-slate-200 dark:border-white/10 hover:scale-105 transition-transform">
                        View in a map
                    </button>
                </div>

                {/* Nearby Places */}
                <div className="flex-1 space-y-6">
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <MapPin size={18} className="text-slate-900 dark:text-white" />
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">What's nearby</h3>
                        </div>
                        <ul className="space-y-2">
                            {[
                                { name: 'Burnham Park', dist: '6 min walk' },
                                { name: 'Session Road', dist: '10 min walk' },
                                { name: 'SM City Baguio', dist: '15 min walk' },
                                { name: 'Baguio Cathedral', dist: '12 min walk' },
                            ].map((place, i) => (
                                <li key={i} className="flex justify-between text-sm text-slate-600 dark:text-slate-300">
                                    <span>{place.name}</span>
                                    <span className="text-slate-400">{place.dist}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <Train size={18} className="text-slate-900 dark:text-white" />
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Public transportation</h3>
                        </div>
                        <ul className="space-y-2">
                            {[
                                { name: 'Baguio Bus Terminal', dist: '8 min drive' },
                                { name: 'Victory Liner Terminal', dist: '10 min drive' },
                            ].map((place, i) => (
                                <li key={i} className="flex justify-between text-sm text-slate-600 dark:text-slate-300">
                                    <span>{place.name}</span>
                                    <span className="text-slate-400">{place.dist}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LocationSection;
