"use client";

import React from 'react';
import { Property } from '@/data/mockProperties';
import { MapPin } from 'lucide-react';

interface BookingWidgetProps {
    property: Property;
    preBookData?: any;
    searchParams?: {
        checkIn?: string;
        checkOut?: string;
        adults?: number;
        children?: number;
    };
}

const BookingWidget: React.FC<BookingWidgetProps> = ({ property, preBookData, searchParams }) => {
    // Format dates if available
    const checkInDate = searchParams?.checkIn ? new Date(searchParams.checkIn) : new Date();
    const checkOutDate = searchParams?.checkOut ? new Date(searchParams.checkOut) : new Date(new Date().setDate(new Date().getDate() + 2));

    // Calculate nights
    const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));

    const formatDate = (date: Date) => {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

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
                {preBookData && (
                    <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-700 dark:text-green-300">
                        <p className="font-bold mb-1">Pre-Check Successful</p>
                        <p className="text-xs opacity-80">Rate Key: {preBookData?.rate?.rate_key || 'Verified'}</p>
                    </div>
                )}
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
                        <div className="text-sm font-medium">
                            {formatDate(checkInDate)} — {formatDate(checkOutDate)} ({nights} nights)
                        </div>
                    </div>
                    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                        <div className="text-xs text-slate-400 uppercase font-bold mb-1">Travelers</div>
                        <div className="text-sm font-medium">
                            {searchParams?.adults || 2} Adults
                            {searchParams?.children ? `, ${searchParams.children} Children` : ''}
                        </div>
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
