'use client';

import React, { useState } from 'react';
import { usePlaceDetails } from '@/hooks/usePlaceDetails';
import { PlaceImage } from './PlaceImage';

export function PlaceList() {
    // Phase 1: Lightweight list mock
    // In a real application, you would invoke a Google Nearby Search or Text Search hook here.
    // The key optimization is that this initial search ONLY asks for the basic fields (id, name, rating).
    const mockSearchResults = [
        { id: 'ChIJN1t_tDeuEmsRUsoyG83frY4', name: 'Googleplex', rating: 4.8 },
        { id: 'ChIJX1M-RS2uEmsR1c9E5D4j3r8', name: 'Computer History Museum', rating: 4.7 },
        { id: 'ChIJ8QFE-y-uEmsRcD_k4L7M1dY', name: 'Shoreline Amphitheatre', rating: 4.6 }
    ];

    const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);

    // Phase 2: Detail Fetch
    // We only trigger the expensive (and strictly cached) details fetch when the user acts.
    const { data: details, isLoading } = usePlaceDetails(selectedPlaceId);

    return (
        <div className="flex gap-4 p-4 max-w-5xl mx-auto h-[600px]">
            {/* List Sidebar */}
            <div className="w-1/3 flex flex-col gap-3 overflow-y-auto pr-2">
                <h3 className="font-extrabold text-xl text-slate-800 dark:text-slate-100 sticky top-0 bg-white/90 dark:bg-slate-900/90 pb-2 backdrop-blur-sm z-10">
                    Nearby Results
                </h3>
                {mockSearchResults.map((place) => (
                    <button
                        key={place.id}
                        onClick={() => setSelectedPlaceId(place.id)}
                        className={`p-4 text-left border rounded-xl hover:border-blue-500 transition-all active:scale-95 group ${
                            selectedPlaceId === place.id 
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 shadow-md ring-2 ring-blue-500/20' 
                                : 'border-slate-200 dark:border-slate-800 hover:shadow-sm'
                        }`}
                    >
                        <div className={`font-bold text-base transition-colors ${selectedPlaceId === place.id ? 'text-blue-700 dark:text-blue-300' : 'text-slate-800 dark:text-slate-200'}`}>
                            {place.name}
                        </div>
                        <div className="flex items-center gap-1.5 mt-2">
                            <span className="text-yellow-500 text-sm">⭐</span>
                            <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">{place.rating}</span>
                        </div>
                    </button>
                ))}
            </div>

            {/* Detail Overview Panel */}
            <div className="flex-1 border rounded-2xl p-8 bg-white dark:bg-slate-900 overflow-y-auto shadow-sm">
                {!selectedPlaceId ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3">
                        <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                            🔍
                        </div>
                        <p className="font-medium">Select a place from the list to view rich details</p>
                    </div>
                ) : isLoading ? (
                    <div className="animate-pulse space-y-6 max-w-2xl">
                        <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded-lg w-2/3" />
                        <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded w-1/3" />
                        <div className="flex gap-3">
                            <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded-full w-20" />
                            <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded-full w-24" />
                        </div>
                        <div className="h-64 bg-slate-200 dark:bg-slate-800 rounded-2xl w-full mt-6" />
                    </div>
                ) : details ? (
                    <div className="max-w-2xl animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white leading-tight">
                            {details.name}
                        </h2>
                        
                        <p className="text-slate-500 dark:text-slate-400 mt-2 font-medium">
                            📍 {details.formatted_address}
                        </p>

                        <div className="mt-4 flex flex-wrap gap-3 text-sm font-bold">
                            {details.price_level !== undefined && (
                                <div className="px-3 py-1 rounded-full bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800">
                                    {'$'.repeat(details.price_level)} <span className="opacity-50 tracking-widest">{'$'.repeat(4 - details.price_level)}</span>
                                </div>
                            )}
                            {details.opening_hours && (
                                <div className={`px-3 py-1 rounded-full border ${details.opening_hours.open_now ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800' : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800'}`}>
                                    {details.opening_hours.open_now ? '🟢 Open Now' : '🔴 Closed'}
                                </div>
                            )}
                            {details.rating && (
                                <div className="px-3 py-1 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800 flex items-center gap-1">
                                    ⭐ {details.rating}
                                </div>
                            )}
                        </div>

                        {details.photos && details.photos.length > 0 && (
                            <div className="mt-8 h-80 relative overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-800 shadow-inner group">
                                <PlaceImage
                                    photoReference={details.photos[0].photo_reference}
                                    maxWidth={800}
                                    alt={`Image of ${details.name}`}
                                    className="w-full h-full transition-transform duration-700 group-hover:scale-105"
                                />
                            </div>
                        )}
                        
                        {details.opening_hours?.weekday_text && (
                            <div className="mt-8">
                                <h4 className="font-bold text-lg mb-3">Hours</h4>
                                <div className="grid gap-2 text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl">
                                    {details.opening_hours.weekday_text.map(day => (
                                        <div key={day} className="flex justify-between border-b border-slate-200 dark:border-slate-700/50 pb-1 last:border-0 last:pb-0">
                                            {/* Extracting 'Monday: 9AM - 5PM' cleanly if desired, or just print */}
                                            <span>{day}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                        <div className="w-12 h-12 rounded-full bg-red-100 text-red-500 flex items-center justify-center mb-3">
                            ⚠️
                        </div>
                        <h4 className="font-bold text-red-600">Failed to load details</h4>
                        <p className="text-sm text-slate-500 mt-1">Please try again later.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
