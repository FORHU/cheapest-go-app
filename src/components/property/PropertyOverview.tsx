"use client";

import React, { useState } from 'react';
import { Star, MapPin, Wifi, Car, Utensils, Coffee, Check } from 'lucide-react';
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

// Rating label based on score
function getRatingLabel(score: number): string {
    if (score >= 9) return 'Exceptional';
    if (score >= 8) return 'Excellent';
    if (score >= 7) return 'Very Good';
    if (score >= 6) return 'Good';
    if (score >= 5) return 'Average';
    return 'Below Average';
}

// Rating badge color based on score
function getRatingBgColor(score: number): string {
    if (score >= 9) return 'bg-emerald-500';
    if (score >= 8) return 'bg-green-500';
    if (score >= 7) return 'bg-blue-600';
    if (score >= 6) return 'bg-yellow-500';
    return 'bg-slate-500';
}

// Inline review card
function InlineReviewCard({ review }: { review: any }) {
    return (
        <div className="bg-white dark:bg-slate-700/50 rounded-lg p-3 border border-slate-200 dark:border-slate-600">
            <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-xs">
                        {review.name ? review.name.charAt(0).toUpperCase() : '?'}
                    </div>
                    <div>
                        <p className="font-medium text-slate-900 dark:text-white text-sm">{review.name || 'Anonymous'}</p>
                        <p className="text-xs text-slate-500">{review.country || ''} {review.type ? `• ${review.type}` : ''}</p>
                    </div>
                </div>
                {review.averageScore > 0 && (
                    <div className="bg-blue-600 text-white px-2 py-0.5 rounded text-xs font-bold">
                        {review.averageScore.toFixed(1)}
                    </div>
                )}
            </div>
            {review.headline && <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-1">"{review.headline}"</p>}
            {review.pros && <p className="text-xs text-slate-600 dark:text-slate-300 mb-1">👍 {review.pros}</p>}
            {review.cons && <p className="text-xs text-slate-600 dark:text-slate-300">👎 {review.cons}</p>}
        </div>
    );
}

const PropertyOverview: React.FC<PropertyOverviewProps> = ({ property, reviewsData }) => {
    const [showReviews, setShowReviews] = useState(false);
    const [showAllReviews, setShowAllReviews] = useState(false);

    // Use real review data if available, fallback to property data
    const rating = reviewsData?.averageRating || property.rating;
    const reviewCount = reviewsData?.totalCount || property.reviews;
    const reviews = reviewsData?.reviews || [];
    const displayedReviews = showAllReviews ? reviews : reviews.slice(0, 4);

    return (
        <div className="space-y-8">
            {/* Header Info */}
            <div>
                <h1 className="text-3xl font-display font-bold text-slate-900 dark:text-white mb-2">
                    {property.name}
                </h1>
                <div className="flex flex-wrap items-center gap-4 text-sm mb-4">
                    <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((s) => {
                            // Convert rating (out of 10) to stars (out of 5)
                            const starRating = rating / 2;
                            const isFilled = s <= Math.round(starRating);
                            return (
                                <Star
                                    key={s}
                                    size={14}
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

                <div className="flex items-start gap-4 p-4 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/10">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-lg text-sm font-bold text-white shrink-0 ${getRatingBgColor(rating)}`}>
                        {rating.toFixed(1)}
                    </div>
                    <div>
                        <div className="font-exrta-bold text-slate-900 dark:text-white flex items-center gap-2">
                            {getRatingLabel(rating)}
                            <span className="text-xs font-normal text-slate-500 px-2 py-0.5 bg-white dark:bg-slate-800 rounded-full border border-slate-200 dark:border-white/10">VIP Access</span>
                        </div>
                        <div className="text-sm text-slate-600 dark:text-slate-300">
                            {reviewCount.toLocaleString()} verified review{reviewCount !== 1 ? 's' : ''}
                        </div>
                        <button
                            onClick={() => setShowReviews(!showReviews)}
                            className="text-xs text-blue-600 hover:underline mt-1 block"
                        >
                            {showReviews ? 'Hide reviews' : 'See all reviews'}
                        </button>
                    </div>
                </div>

                {/* Inline Reviews Section */}
                {showReviews && (
                    <div className="mt-4 p-4 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/10">
                        <h3 className="font-bold text-slate-900 dark:text-white mb-3">Guest Reviews</h3>
                        {reviews.length === 0 ? (
                            <p className="text-sm text-slate-500">No reviews available yet.</p>
                        ) : (
                            <>
                                <div className="grid gap-3 md:grid-cols-2">
                                    {displayedReviews.map((review: any, index: number) => (
                                        <InlineReviewCard key={`${review.name}-${index}`} review={review} />
                                    ))}
                                </div>
                                {reviews.length > 4 && (
                                    <button
                                        onClick={() => setShowAllReviews(!showAllReviews)}
                                        className="mt-3 text-sm text-blue-600 hover:underline"
                                    >
                                        {showAllReviews ? 'Show less' : `Show all ${reviews.length} reviews`}
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>

            <div className="flex flex-col gap-8">
                <div className="w-full">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">About this property</h2>
                    <div className="text-sm text-slate-700 dark:text-slate-300 space-y-4 leading-relaxed whitespace-pre-line">
                        {stripHtml(property.description)}
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
