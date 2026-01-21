"use client";

import React from 'react';
import { Property } from '@/data/mockProperties';
import { MapPin } from 'lucide-react';

const BookingWidget: React.FC<{ property: Property }> = ({ property }) => {
    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-white/10 shadow-lg sticky top-24 overflow-hidden">
            {/* Map Preview */}
            <div className="h-32 bg-slate-100 dark:bg-slate-800 relative flex items-center justify-center">
                <MapPin className="text-slate-300" size={32} />
                <span className="sr-only">Map View</span>
                <button className="absolute bottom-3 bg-white dark:bg-slate-900 text-xs font-bold px-3 py-1.5 rounded-full shadow-md border border-slate-200 dark:border-white/10">
                    View on map
                </button>
            </div>

            <div className="p-6">
                <div className="mb-6">
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-slate-900 dark:text-white">₱{property.price.toLocaleString()}</span>
                        <span className="text-sm text-slate-500">avg/night</span>
                    </div>
                    {property.originalPrice && (
                        <div className="text-sm text-slate-400 line-through">
                            ₱{property.originalPrice.toLocaleString()}
                        </div>
                    )}
                </div>

                <div className="space-y-3">
                    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                        <div className="text-xs text-slate-400 uppercase font-bold mb-1">Dates</div>
                        <div className="text-sm font-medium">Jan 23 — Jan 25 (2 nights)</div>
                    </div>
                    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                        <div className="text-xs text-slate-400 uppercase font-bold mb-1">Travelers</div>
                        <div className="text-sm font-medium">2 Adults</div>
                    </div>
                </div>

                <button
                    onClick={() => {
                        const element = document.getElementById('room-list-section');
                        if (element) {
                            element.scrollIntoView({ behavior: 'smooth' });
                        }
                    }}
                    className="w-full mt-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors"
                >
                    Reserve
                </button>

                <p className="text-center text-xs text-slate-500 mt-3">
                    You won't be charged yet
                </p>
            </div>
        </div>
    );
};

export default BookingWidget;
