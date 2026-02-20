"use client";

import { Users, Heart, UserCircle, Briefcase, Users2 } from 'lucide-react';
import {
    HotelReview,
    formatReviewDate,
    getRatingLabel,
    getRatingColor,
    calculateTravelerBreakdown,
    TravelerBreakdown
} from '@/lib/property/fetchReviews';
import { useReviewsStore } from '@/stores/reviewsStore';

interface ReviewsSectionProps {
    reviews: HotelReview[];
    averageRating: number;
    totalCount: number;
}

// === Sub-components ===

/**
 * Rating Summary Card - Shows overall score and label
 */
function RatingSummary({ rating, totalCount }: { rating: number; totalCount: number }) {
    return (
        <div className="flex items-center gap-3 mb-6">
            <div className={`${getRatingColor(rating)} text-white w-12 h-12 rounded-lg flex items-center justify-center font-bold text-xl`}>
                {rating > 0 ? rating.toFixed(0) : '-'}
            </div>
            <div>
                <p className="font-semibold text-slate-900 dark:text-white text-lg">
                    {getRatingLabel(rating)}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Based on {totalCount} review{totalCount !== 1 ? 's' : ''}
                </p>
            </div>
        </div>
    );
}

/**
 * Who Stays Here Section - Shows traveler type breakdown
 */
function WhoStaysHere({ breakdown }: { breakdown: TravelerBreakdown }) {
    const types = [
        { key: 'family', label: 'Family', icon: Users, value: breakdown.family },
        { key: 'couple', label: 'Couple', icon: Heart, value: breakdown.couple },
        { key: 'friendsGroup', label: 'Friends/Group', icon: Users2, value: breakdown.friendsGroup },
        { key: 'solo', label: 'Solo', icon: UserCircle, value: breakdown.solo },
        { key: 'business', label: 'Business', icon: Briefcase, value: breakdown.business },
    ].filter(t => t.value > 0);

    if (types.length === 0) return null;

    return (
        <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Who stays here</h3>
            <div className="flex flex-wrap gap-4">
                {types.map(({ key, label, icon: Icon, value }) => (
                    <div key={key} className="flex flex-col items-center text-center">
                        <Icon className="w-5 h-5 text-slate-400 mb-1" />
                        <span className="text-xs text-slate-600 dark:text-slate-300">{label}</span>
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{value}%</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * Single Review Item - Matches LiteAPI style
 */
function ReviewItem({ review, index }: { review: HotelReview; index: number }) {
    const { toggleExpanded, expandedReviewIds } = useReviewsStore();
    const reviewId = `${review.name}-${index}`;
    const isExpanded = expandedReviewIds.has(reviewId);

    // Combine pros and cons into review text
    const reviewText = [review.pros, review.cons].filter(Boolean).join(' ');
    const isLongText = reviewText.length > 200;
    const displayText = isLongText && !isExpanded
        ? reviewText.substring(0, 200) + '...'
        : reviewText;

    return (
        <div className="py-4 border-b border-slate-100 dark:border-slate-700 last:border-b-0">
            <div className="flex items-start justify-between gap-4">
                {/* Left: Reviewer info */}
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-slate-900 dark:text-white">
                            {review.name || 'Anonymous'}
                        </span>
                        {review.type && (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                • {review.type}
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">
                        {formatReviewDate(review.date)}
                    </p>

                    {/* Headline */}
                    {review.headline && (
                        <p className="font-medium text-slate-800 dark:text-slate-200 mb-1">
                            {review.headline}
                        </p>
                    )}

                    {/* Review text with pros/cons */}
                    {reviewText && (
                        <div className="text-sm text-slate-600 dark:text-slate-300">
                            {review.pros && (
                                <p className="mb-1">
                                    <span className="text-emerald-500">👍</span> {isExpanded || !isLongText ? review.pros : review.pros.substring(0, 100) + '...'}
                                </p>
                            )}
                            {review.cons && (isExpanded || review.pros === undefined) && (
                                <p>
                                    <span className="text-amber-500">👎</span> {review.cons}
                                </p>
                            )}
                            {isLongText && (
                                <button
                                    onClick={() => toggleExpanded(reviewId)}
                                    className="text-blue-600 hover:text-blue-700 text-xs font-medium mt-1"
                                >
                                    {isExpanded ? 'Show Less' : 'Show More'}
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Right: Score badge */}
                {review.averageScore > 0 && (
                    <div className={`${getRatingColor(review.averageScore)} text-white w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0`}>
                        {review.averageScore.toFixed(0)}
                    </div>
                )}
            </div>
        </div>
    );
}

// === Main Component ===

export default function ReviewsSection({ reviews, averageRating, totalCount }: ReviewsSectionProps) {
    const {
        displayCount,
        loadMore,
        sortBy,
        setSortBy,
    } = useReviewsStore();

    // Use server-fetched reviews directly from props (no store copy needed)
    const reviewsToDisplay = reviews;

    // Calculate traveler breakdown
    const travelerBreakdown = calculateTravelerBreakdown(reviewsToDisplay);

    // Sort reviews
    const sortedReviews = [...reviewsToDisplay].sort((a, b) => {
        if (sortBy === 'highest') return (b.averageScore || 0) - (a.averageScore || 0);
        if (sortBy === 'lowest') return (a.averageScore || 0) - (b.averageScore || 0);
        // Default: newest first (by date)
        return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    const displayedReviews = sortedReviews.slice(0, displayCount);
    const hasMore = displayCount < reviewsToDisplay.length;

    if (totalCount === 0) {
        return (
            <section id="reviews-section" className="py-8">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Guest reviews</h2>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-8 text-center">
                    <UserCircle className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-500 dark:text-slate-400">
                        No reviews available yet for this property.
                    </p>
                </div>
            </section>
        );
    }

    return (
        <section id="reviews-section" className="py-8">
            <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 lg:gap-8">
                {/* Left Column - Summary */}
                <div className="lg:w-64 flex-shrink-0">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Guest reviews</h2>

                    <RatingSummary rating={averageRating} totalCount={totalCount} />
                    <WhoStaysHere breakdown={travelerBreakdown} />
                </div>

                {/* Right Column - Reviews List */}
                <div className="flex-1">
                    {/* Sort dropdown */}
                    <div className="flex justify-end mb-4">
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as 'newest' | 'highest' | 'lowest')}
                            className="text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                        >
                            <option value="newest">Newest first</option>
                            <option value="highest">Highest rated</option>
                            <option value="lowest">Lowest rated</option>
                        </select>
                    </div>

                    {/* Reviews list in scrollable container */}
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 max-h-[500px] overflow-y-auto">
                        <div className="px-4">
                            {displayedReviews.map((review, index) => (
                                <ReviewItem key={`${review.name}-${index}`} review={review} index={index} />
                            ))}
                        </div>
                    </div>

                    {/* Load more button */}
                    <div className="mt-4 flex items-center justify-between">
                        {hasMore && (
                            <button
                                onClick={() => loadMore()}
                                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                            >
                                Load more reviews
                            </button>
                        )}
                        <span className="text-sm text-slate-500 dark:text-slate-400">
                            Showing {displayedReviews.length} of {reviewsToDisplay.length} reviews
                        </span>
                    </div>
                </div>
            </div>
        </section>
    );
}
