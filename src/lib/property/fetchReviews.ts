/**
 * Server-side data fetching utilities for hotel reviews.
 * Pure functions for use in server components.
 */

import { getHotelReviews } from '@/utils/supabase/functions';

// Types
export interface HotelReview {
    averageScore: number;
    name: string;
    date: string;
    headline?: string;
    pros?: string;
    cons?: string;
    country?: string;
    type?: string;
    language?: string;
    source?: string;
}

export interface ReviewsData {
    reviews: HotelReview[];
    averageRating: number;
    totalCount: number;
}

/**
 * Calculate average rating from reviews
 */
export function calculateAverageRating(reviews: HotelReview[]): number {
    if (!reviews || reviews.length === 0) return 0;
    const sum = reviews.reduce((acc, review) => acc + (review.averageScore || 0), 0);
    return Math.round((sum / reviews.length) * 10) / 10;
}

/**
 * Format review date for display
 */
export function formatReviewDate(dateStr: string): string {
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch {
        return dateStr;
    }
}

/**
 * Get reviewer initials for avatar
 */
export function getReviewerInitials(name: string): string {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Main fetch function for reviews - server-side
 */
export async function fetchHotelReviews(hotelId: string, limit: number = 20): Promise<ReviewsData> {
    try {
        console.log(`[fetchHotelReviews] Fetching reviews for hotelId: ${hotelId}`);
        const reviews = await getHotelReviews(hotelId, limit) as HotelReview[];

        return {
            reviews,
            averageRating: calculateAverageRating(reviews),
            totalCount: reviews.length
        };
    } catch (error) {
        console.error('[fetchHotelReviews] Error:', error);
        return {
            reviews: [],
            averageRating: 0,
            totalCount: 0
        };
    }
}
