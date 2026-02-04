/**
 * ReviewsSection - Displays hotel reviews with "See all" functionality
 * Uses client-side state for expand/collapse
 */

"use client";

import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown, User, MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import { HotelReview, formatReviewDate, getReviewerInitials } from '@/lib/property/fetchReviews';

interface ReviewsSectionProps {
    reviews: HotelReview[];
    averageRating: number;
    totalCount: number;
    initialDisplayCount?: number;
}

// Rating badge color based on score
function getRatingColor(score: number): string {
    if (score >= 9) return 'bg-emerald-500';
    if (score >= 8) return 'bg-green-500';
    if (score >= 7) return 'bg-lime-500';
    if (score >= 6) return 'bg-yellow-500';
    return 'bg-orange-500';
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

// Individual review card component
function ReviewCard({ review }: { review: HotelReview }) {
    return (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow">
            {/* Header: Reviewer info + Score */}
            <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
                        {getReviewerInitials(review.name)}
                    </div>
                    <div>
                        <p className="font-medium text-slate-900 dark:text-white">
                            {review.name || 'Anonymous'}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            {review.country && (
                                <span className="flex items-center gap-1">
                                    <MapPin size={10} />
                                    {review.country}
                                </span>
                            )}
                            {review.type && (
                                <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 rounded">
                                    {review.type}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Score badge */}
                {review.averageScore > 0 && (
                    <div className={`${getRatingColor(review.averageScore)} text-white px-2.5 py-1 rounded-lg font-bold text-sm`}>
                        {review.averageScore.toFixed(1)}
                    </div>
                )}
            </div>

            {/* Headline */}
            {review.headline && (
                <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">
                    "{review.headline}"
                </h4>
            )}

            {/* Pros */}
            {review.pros && (
                <div className="flex items-start gap-2 mb-2">
                    <ThumbsUp size={14} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-slate-600 dark:text-slate-300">{review.pros}</p>
                </div>
            )}

            {/* Cons */}
            {review.cons && (
                <div className="flex items-start gap-2 mb-2">
                    <ThumbsDown size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-slate-600 dark:text-slate-300">{review.cons}</p>
                </div>
            )}

            {/* Date */}
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-3">
                Reviewed {formatReviewDate(review.date)}
            </p>
        </div>
    );
}

// Main Reviews Section Component
export default function ReviewsSection({
    reviews,
    averageRating,
    totalCount,
    initialDisplayCount = 3
}: ReviewsSectionProps) {
    const [showAll, setShowAll] = useState(false);

    const displayedReviews = showAll ? reviews : reviews.slice(0, initialDisplayCount);
    const hasMoreReviews = reviews.length > initialDisplayCount;

    if (totalCount === 0) {
        return (
            <section id="reviews-section" className="py-8">
                <h2 className="text-2xl font-display font-bold text-slate-900 dark:text-white mb-6">
                    Guest Reviews
                </h2>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-8 text-center">
                    <User className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-500 dark:text-slate-400">
                        No reviews available yet for this property.
                    </p>
                </div>
            </section>
        );
    }

    return (
        <section id="reviews-section" className="py-8">
            {/* Header with overall rating */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <h2 className="text-2xl font-display font-bold text-slate-900 dark:text-white">
                    Guest Reviews
                </h2>

                {/* Overall rating summary */}
                <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-2">
                    <div className={`${getRatingColor(averageRating)} text-white px-3 py-1.5 rounded-lg font-bold text-lg`}>
                        {averageRating.toFixed(1)}
                    </div>
                    <div>
                        <p className="font-semibold text-slate-900 dark:text-white text-sm">
                            {getRatingLabel(averageRating)}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Based on {totalCount} review{totalCount !== 1 ? 's' : ''}
                        </p>
                    </div>
                </div>
            </div>

            {/* Reviews grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {displayedReviews.map((review, index) => (
                    <ReviewCard key={`${review.name}-${index}`} review={review} />
                ))}
            </div>

            {/* See all / Show less button */}
            {hasMoreReviews && (
                <div className="mt-6 text-center">
                    <button
                        onClick={() => setShowAll(!showAll)}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl transition-colors"
                    >
                        {showAll ? (
                            <>
                                <ChevronUp size={18} />
                                Show less
                            </>
                        ) : (
                            <>
                                <ChevronDown size={18} />
                                See all {reviews.length} reviews
                            </>
                        )}
                    </button>
                </div>
            )}
        </section>
    );
}
