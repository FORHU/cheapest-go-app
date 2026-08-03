"use client";

import React, { useState } from 'react';
import { Star, Wifi, Car, Utensils, Coffee, Check, Clock, Phone, Globe, Mail, Info } from 'lucide-react';
import { type Property } from '@/types';
import { useTranslations } from 'next-intl';

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
import { getRatingLabel, getRatingColor as getRatingBgColor } from '@/lib/property/reviewsUtils';

const PropertyOverview: React.FC<PropertyOverviewProps> = ({ property, reviewsData }) => {
    // Use real review data if available, fallback to property data
    const rating = Number(reviewsData?.averageRating || property.rating) || 0;
    const reviewCount = reviewsData?.totalCount || property.reviews;

    // UI state for expanding description and amenities
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
    const [isAmenitiesExpanded, setIsAmenitiesExpanded] = useState(false);

    const descriptionText = stripHtml(property.description);
    const isDescriptionLong = descriptionText.length > 150;
    const t = useTranslations('propertyOverview');
    const tRatings = useTranslations('hotels.ratings');

    return (
        <div id="overview-section" className="space-y-4 md:space-y-8 scroll-mt-24 md:scroll-mt-36">
            {/* Header Info */}
            <div>
                <h1 className="text-[13px] lg:text-3xl font-display font-bold text-slate-900 dark:text-white mb-1 lg:mb-2">
                    {property.name}
                </h1>
                <div className="flex flex-wrap items-center gap-1.5 lg:gap-4 text-[10px] lg:text-sm mb-1.5 lg:mb-4">
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

                <div className="flex items-center gap-2 lg:gap-4 p-2 lg:p-4 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/10">
                    <div className={`flex items-center justify-center w-7 h-7 lg:w-10 lg:h-10 rounded-lg text-[10px] lg:text-sm font-bold text-white shrink-0 ${getRatingBgColor(rating)}`}>
                        {rating.toFixed(1)}
                    </div>
                    <div>
                        <div className="font-extra-bold text-[11px] lg:text-base text-slate-900 dark:text-white">
                            {tRatings(getRatingLabel(rating))}
                        </div>
                        <div className="text-[9px] lg:text-sm text-slate-600 dark:text-slate-300">
                            {reviewCount !== 1
                                ? t('verifiedReviews', { count: reviewCount.toLocaleString() })
                                : t('verifiedReview', { count: reviewCount.toLocaleString() })}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-4 md:gap-8">
                {descriptionText && (
                    <div className="w-full">
                        <h2 className="text-[12px] lg:text-xl font-bold text-slate-900 dark:text-white mb-1 lg:mb-4">{t('aboutProperty')}</h2>
                        <div className={`text-[10px] lg:text-sm text-slate-700 dark:text-slate-300 space-y-1.5 lg:space-y-4 leading-relaxed whitespace-pre-line ${(!isDescriptionExpanded && isDescriptionLong) ? 'line-clamp-4' : ''}`}>
                            {descriptionText}
                        </div>
                        {isDescriptionLong && (
                            <button
                                onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                                className="text-blue-600 text-[10px] lg:text-sm font-medium hover:underline mt-1 lg:mt-2 focus:outline-none"
                            >
                                {isDescriptionExpanded ? t('showLess') : t('readMore')}
                            </button>
                        )}
                    </div>
                )}

                {/* Popular amenities - Full width grid */}
                {Array.isArray(property.amenities) && property.amenities.length > 0 && (
                    <div id="amenities-section" className="w-full scroll-mt-24 lg:scroll-mt-36">
                        <h3 className="text-[11px] lg:text-sm font-bold text-slate-900 dark:text-white mb-1 lg:mb-4">{t('popularAmenities')}</h3>
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-1 lg:gap-4">
                            {(isAmenitiesExpanded ? property.amenities : property.amenities.slice(0, 6)).map((amenity, i) => (
                                <div key={i} className="flex items-center text-[10px] lg:text-sm text-slate-700 dark:text-slate-300">
                                    {amenity === 'Free WiFi' && <Wifi size={11} className="mr-1 lg:mr-3 shrink-0" />}
                                    {amenity === 'Parking' && <Car size={11} className="mr-1 lg:mr-3 shrink-0" />}
                                    {amenity === 'Restaurant' && <Utensils size={11} className="mr-1 lg:mr-3 shrink-0" />}
                                    {amenity === 'Breakfast included' && <Coffee size={11} className="mr-1 lg:mr-3 shrink-0" />}
                                    {!['Free WiFi', 'Parking', 'Restaurant', 'Breakfast included'].includes(amenity) && <Check size={11} className="mr-1 lg:mr-3 text-emerald-500 shrink-0" />}
                                    {amenity}
                                </div>
                            ))}
                        </div>
                        {property.amenities.length > 6 && (
                            <button
                                onClick={() => setIsAmenitiesExpanded(!isAmenitiesExpanded)}
                                className="text-blue-600 text-[10px] lg:text-sm font-medium hover:underline mt-1.5 lg:mt-4 focus:outline-none"
                            >
                                {isAmenitiesExpanded ? t('showLessAmenities') : t('seeAllAmenities', { count: property.amenities.length })}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Check-in / Check-out times */}
            {(property.checkIn || property.checkOut) && (
                <div className="border border-slate-100 dark:border-white/10 rounded-xl overflow-hidden">
                    <div className="flex divide-x divide-slate-100 dark:divide-white/10">
                        {property.checkIn && (
                            <div className="flex-1 p-2 lg:p-4">
                                <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-[9px] lg:text-xs mb-0.5 lg:mb-1">
                                    <Clock size={10} />
                                    <span>{t('checkIn')}</span>
                                </div>
                                <div className="text-[11px] lg:text-sm font-bold text-slate-900 dark:text-white">{property.checkIn}</div>
                            </div>
                        )}
                        {property.checkOut && (
                            <div className="flex-1 p-2 lg:p-4">
                                <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-[9px] lg:text-xs mb-0.5 lg:mb-1">
                                    <Clock size={10} />
                                    <span>{t('checkOut')}</span>
                                </div>
                                <div className="text-[11px] lg:text-sm font-bold text-slate-900 dark:text-white">{property.checkOut}</div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Contact info */}
            {(property.contactPhone || property.contactEmail || property.contactWeb) && (
                <div className="space-y-1.5 lg:space-y-2">
                    <h3 className="text-[11px] lg:text-sm font-bold text-slate-900 dark:text-white">{t('contactInfo')}</h3>
                    <div className="flex flex-col gap-1 lg:gap-2 text-[10px] lg:text-sm text-slate-700 dark:text-slate-300">
                        {property.contactPhone && (
                            <a href={`tel:${property.contactPhone}`} className="flex items-center gap-1.5 hover:text-blue-600">
                                <Phone size={11} className="shrink-0" />
                                {property.contactPhone}
                            </a>
                        )}
                        {property.contactEmail && (
                            <a href={`mailto:${property.contactEmail}`} className="flex items-center gap-1.5 hover:text-blue-600">
                                <Mail size={11} className="shrink-0" />
                                {property.contactEmail}
                            </a>
                        )}
                        {property.contactWeb && (
                            <a href={property.contactWeb} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-blue-600 truncate">
                                <Globe size={11} className="shrink-0" />
                                {property.contactWeb.replace(/^https?:\/\//, '')}
                            </a>
                        )}
                    </div>
                </div>
            )}

            {/* Important information */}
            {property.importantInformation && (
                <div className="bg-amber-50 dark:bg-amber-900/10 p-2 lg:p-4 rounded-xl flex gap-1.5 lg:gap-3 text-[10px] lg:text-sm">
                    <Info size={14} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div>
                        <span className="font-bold text-amber-900 dark:text-amber-200">{t('importantInfo')}</span>
                        <p className="text-amber-800 dark:text-amber-300 mt-0.5 lg:mt-1 whitespace-pre-line">
                            {stripHtml(property.importantInformation)}
                        </p>
                    </div>
                </div>
            )}

            {/* Cleaning & Safety - Condensed */}
            <div className="bg-emerald-50 dark:bg-emerald-900/10 p-2 lg:p-4 rounded-xl flex gap-1.5 lg:gap-3 text-[10px] lg:text-sm">
                <Check size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div>
                    <span className="font-bold text-emerald-900 dark:text-emerald-200">{t('cleaningSafety.title')}</span>
                    <p className="text-emerald-800 dark:text-emerald-300 mt-0.5 lg:mt-1">
                        {t('cleaningSafety.description')}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default PropertyOverview;
