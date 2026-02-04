/**
 * ReviewsSummary - Compact reviews display for property header
 * Shows rating badge and "See all reviews" link
 */

"use client";

import React from 'react';
import { HotelReview } from '@/lib/property/fetchReviews';

interface ReviewsSummaryProps {
    reviews: HotelReview[];
    averageRating: number;
    totalCount: number;
    onSeeAllClick?: () => void;
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

export default function ReviewsSummary({ averageRating, totalCount, onSeeAllClick }: ReviewsSummaryProps) {
    if (totalCount === 0) {
        return (
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <span>No reviews yet</span>
            </div>
        );
    }

    const handleClick = () => {
        if (onSeeAllClick) {
            onSeeAllClick();
        } else {
            // Scroll to reviews section
            const reviewsSection = document.getElementById('reviews-section');
            if (reviewsSection) {
                reviewsSection.scrollIntoView({ behavior: 'smooth' });
            }
        }
    };

    return (
        <div className="flex items-center gap-3">
            {/* Rating badge */}
            <div className={`${getRatingColor(averageRating)} text-white px-2.5 py-1 rounded-lg font-bold text-sm`}>
                {averageRating.toFixed(1)}
            </div>

            {/* Rating info */}
            <div className="flex flex-col">
                <span className="font-semibold text-slate-900 dark:text-white text-sm">
                    {getRatingLabel(averageRating)}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                    {totalCount} verified review{totalCount !== 1 ? 's' : ''}
                </span>
            </div>

            {/* See all reviews link */}
            <button
                onClick={handleClick}
                className="text-blue-600 dark:text-blue-400 text-sm font-medium hover:underline ml-2"
            >
                See all reviews
            </button>
        </div>
    );
}
