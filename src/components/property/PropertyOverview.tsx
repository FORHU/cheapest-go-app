"use client";

import React, { useState } from 'react';
import { Star, Wifi, Car, Utensils, Coffee, Check } from 'lucide-react';
import { Property } from '@/data/mockProperties';

interface ReviewsData {
    reviews: any[];
    averageRating: number;
    totalCount: number;
}

interface PropertyOverviewProps {
    property: Property;
    reviewsData?: ReviewsData;
}

// Strip HTML tags from text
function stripHtml(html: string): string {
    if (!html) return '';
    // Replace <br>, <br/>, <br /> tags with newlines
    let text = html.replace(/<br\s*\/?>/gi, '\n');
    // Replace </p> tags with double newlines for paragraph breaks
    text = text.replace(/<\/p>/gi, '\n\n');
    // Remove all other HTML tags
    text = text.replace(/<[^>]*>/g, '');
    // Decode common HTML entities
    text = text.replace(/&nbsp;/gi, ' ');
    text = text.replace(/&amp;/gi, '&');
    text = text.replace(/&lt;/gi, '<');
    text = text.replace(/&gt;/gi, '>');
    text = text.replace(/&quot;/gi, '"');
    // Clean up extra whitespace
    text = text.replace(/\n{3,}/g, '\n\n').trim();
    return text;
}

// Import centralized rating helper functions
import { getRatingLabel, getRatingColor as getRatingBgColor } from '@/lib/property/fetchReviews';

const PropertyOverview: React.FC<PropertyOverviewProps> = ({ property, reviewsData }) => {
    // Use real review data if available, fallback to property data
    const rating = reviewsData?.averageRating || property.rating;
    const reviewCount = reviewsData?.totalCount || property.reviews;

    // UI state for expanding description and amenities
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
    const [isAmenitiesExpanded, setIsAmenitiesExpanded] = useState(false);

    const descriptionText = stripHtml(property.description);
    const isDescriptionLong = descriptionText.length > 150;

    return (
        <div id="overview-section" className="space-y-4 md:space-y-8 scroll-mt-24 md:scroll-mt-36">
            {/* Header Info */}
            <div>
                <h1 className="text-base md:text-3xl font-display font-bold text-slate-900 dark:text-white mb-1.5 md:mb-2">
                    {property.name}
                </h1>
                <div className="flex flex-wrap items-center gap-2 md:gap-4 text-xs md:text-sm mb-2 md:mb-4">
                    <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((s) => {
                            // Convert rating (out of 10) to stars (out of 5)
                            const starRating = rating / 2;
                            const isFilled = s <= Math.round(starRating);
                            return (
                                <Star
                                    key={s}
                                    size={12}
                                    className={isFilled
                                        ? "fill-current text-slate-900 dark:text-white"
                                        : "text-slate-300 dark:text-slate-600"
                                    }
                                />
                            );
                        })}
                    </div>
                    <div className="text-slate-500 dark:text-slate-400">
                        {property.location}
                    </div>
                </div>

                <div className="flex items-center gap-2 md:gap-4 p-2 md:p-4 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/10">
                    <div className={`flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-lg text-[11px] md:text-sm font-bold text-white shrink-0 ${getRatingBgColor(rating)}`}>
                        {rating.toFixed(1)}
                    </div>
                    <div>
                        <div className="font-extra-bold text-xs md:text-base text-slate-900 dark:text-white">
                            {getRatingLabel(rating)}
                        </div>
                        <div className="text-[10px] md:text-sm text-slate-600 dark:text-slate-300">
                            {reviewCount.toLocaleString()} verified review{reviewCount !== 1 ? 's' : ''}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-4 md:gap-8">
                <div className="w-full">
                    <h2 className="text-sm md:text-xl font-bold text-slate-900 dark:text-white mb-1.5 md:mb-4">About this property</h2>
                    <div className={`text-[11px] md:text-sm text-slate-700 dark:text-slate-300 space-y-2 md:space-y-4 leading-relaxed whitespace-pre-line ${(!isDescriptionExpanded && isDescriptionLong) ? 'line-clamp-4' : ''}`}>
                        {descriptionText}
                    </div>
                    {isDescriptionLong && (
                        <button
                            onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                            className="text-blue-600 text-[11px] md:text-sm font-medium hover:underline mt-1 md:mt-2 focus:outline-none"
                        >
                            {isDescriptionExpanded ? 'Show less' : 'Read more'}
                        </button>
                    )}
                </div>

                {/* Popular amenities - Full width grid */}
                <div id="amenities-section" className="w-full scroll-mt-24 md:scroll-mt-36">
                    <h3 className="text-[11px] md:text-sm font-bold text-slate-900 dark:text-white mb-1.5 md:mb-4">Popular amenities</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 md:gap-4">
                        {(isAmenitiesExpanded ? property.amenities : property.amenities.slice(0, 6)).map((amenity, i) => (
                            <div key={i} className="flex items-center text-[11px] md:text-sm text-slate-700 dark:text-slate-300">
                                {amenity === 'Free WiFi' && <Wifi size={12} className="mr-1.5 md:mr-3 shrink-0" />}
                                {amenity === 'Parking' && <Car size={12} className="mr-1.5 md:mr-3 shrink-0" />}
                                {amenity === 'Restaurant' && <Utensils size={12} className="mr-1.5 md:mr-3 shrink-0" />}
                                {amenity === 'Breakfast included' && <Coffee size={12} className="mr-1.5 md:mr-3 shrink-0" />}
                                {!['Free WiFi', 'Parking', 'Restaurant', 'Breakfast included'].includes(amenity) && <Check size={12} className="mr-1.5 md:mr-3 text-emerald-500 shrink-0" />}
                                {amenity}
                            </div>
                        ))}
                    </div>
                    {property.amenities.length > 6 && (
                        <button
                            onClick={() => setIsAmenitiesExpanded(!isAmenitiesExpanded)}
                            className="text-blue-600 text-[11px] md:text-sm font-medium hover:underline mt-2 md:mt-4 focus:outline-none"
                        >
                            {isAmenitiesExpanded ? 'Show less amenities' : `See all ${property.amenities.length} amenities`}
                        </button>
                    )}
                </div>
            </div>

            {/* Cleaning & Safety - Condensed */}
            <div className="bg-emerald-50 dark:bg-emerald-900/10 p-2 md:p-4 rounded-xl flex gap-1.5 md:gap-3 text-[11px] md:text-sm">
                <Check size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div>
                    <span className="font-bold text-emerald-900 dark:text-emerald-200">Cleaning and safety practices</span>
                    <p className="text-emerald-800 dark:text-emerald-300 mt-0.5 md:mt-1">
                        This property has extensive hygiene measures in place, including contactless check-in and enhanced cleaning protocols.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default PropertyOverview;
