/**
 * ReviewsModal - Shows reviews in a popup/modal
 */

"use client";

import React, { useState } from 'react';
import { X, ThumbsUp, ThumbsDown, MapPin, ChevronDown } from 'lucide-react';
import { HotelReview, formatReviewDate, getReviewerInitials, getRatingColor, getRatingLabel } from '@/lib/property/fetchReviews';

interface ReviewsModalProps {
    isOpen: boolean;
    onClose: () => void;
    reviews: HotelReview[];
    averageRating: number;
    totalCount: number;
}

// Individual review card
function ReviewCard({ review }: { review: HotelReview }) {
    return (
        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 border border-slate-200 dark:border-slate-600">
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-xs">
                        {getReviewerInitials(review.name)}
                    </div>
                    <div>
                        <p className="font-medium text-slate-900 dark:text-white text-sm">
                            {review.name || 'Anonymous'}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            {review.country && (
                                <span className="flex items-center gap-1">
                                    <MapPin size={10} />
                                    {review.country}
                                </span>
                            )}
                            {review.type && <span>{review.type}</span>}
                        </div>
                    </div>
                </div>
                {review.averageScore > 0 && (
                    <div className={`${getRatingColor(review.averageScore)} text-white px-2 py-0.5 rounded text-xs font-bold`}>
                        {review.averageScore.toFixed(1)}
                    </div>
                )}
            </div>

            {review.headline && (
                <p className="font-medium text-slate-800 dark:text-slate-200 text-sm mb-2">"{review.headline}"</p>
            )}

            {review.pros && (
                <div className="flex items-start gap-2 mb-1">
                    <ThumbsUp size={12} className="text-emerald-500 mt-0.5" />
                    <p className="text-xs text-slate-600 dark:text-slate-300">{review.pros}</p>
                </div>
            )}

            {review.cons && (
                <div className="flex items-start gap-2 mb-1">
                    <ThumbsDown size={12} className="text-red-400 mt-0.5" />
                    <p className="text-xs text-slate-600 dark:text-slate-300">{review.cons}</p>
                </div>
            )}

            <p className="text-xs text-slate-400 mt-2">{formatReviewDate(review.date)}</p>
        </div>
    );
}

export default function ReviewsModal({ isOpen, onClose, reviews, averageRating, totalCount }: ReviewsModalProps) {
    const [showAll, setShowAll] = useState(false);
    const displayedReviews = showAll ? reviews : reviews.slice(0, 4);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                        <div className={`${getRatingColor(averageRating)} text-white px-3 py-1.5 rounded-lg font-bold`}>
                            {averageRating.toFixed(1)}
                        </div>
                        <div>
                            <p className="font-bold text-slate-900 dark:text-white">
                                {getRatingLabel(averageRating)}
                            </p>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                {totalCount} verified review{totalCount !== 1 ? 's' : ''}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
                    >
                        <X size={20} className="text-slate-500" />
                    </button>
                </div>

                {/* Reviews list */}
                <div className="p-5 overflow-y-auto max-h-[calc(80vh-120px)]">
                    {reviews.length === 0 ? (
                        <p className="text-center text-slate-500 py-8">No reviews available</p>
                    ) : (
                        <div className="space-y-3">
                            {displayedReviews.map((review, index) => (
                                <ReviewCard key={`${review.name}-${index}`} review={review} />
                            ))}
                        </div>
                    )}

                    {/* Show more button */}
                    {reviews.length > 4 && !showAll && (
                        <button
                            onClick={() => setShowAll(true)}
                            className="w-full mt-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center justify-center gap-1"
                        >
                            <ChevronDown size={16} />
                            Show all {reviews.length} reviews
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
