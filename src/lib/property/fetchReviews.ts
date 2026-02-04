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

// === Helper Functions for UI ===

/**
 * Rating label based on score (0-10 scale)
 */
export function getRatingLabel(score: number): string {
    if (score >= 9) return 'Exceptional';
    if (score >= 8) return 'Excellent';
    if (score >= 7) return 'Very Good';
    if (score >= 6) return 'Good';
    if (score >= 5) return 'Average';
    return 'Below Average';
}

/**
 * Rating badge color based on score - consistent across app
 */
export function getRatingColor(score: number): string {
    if (score >= 9) return 'bg-indigo-600';    // Exceptional
    if (score >= 8) return 'bg-emerald-500';   // Excellent
    if (score >= 7) return 'bg-teal-500';      // Very Good
    if (score >= 6) return 'bg-blue-500';      // Good
    return 'bg-amber-500';                      // Average/Below
}

/**
 * Traveler type breakdown interface
 */
export interface TravelerBreakdown {
    family: number;
    couple: number;
    friendsGroup: number;
    solo: number;
    business: number;
}

/**
 * Calculate traveler type breakdown from reviews
 */
export function calculateTravelerBreakdown(reviews: HotelReview[]): TravelerBreakdown {
    if (!reviews || reviews.length === 0) {
        return { family: 0, couple: 0, friendsGroup: 0, solo: 0, business: 0 };
    }

    const counts = { family: 0, couple: 0, friendsGroup: 0, solo: 0, business: 0 };

    reviews.forEach(review => {
        const type = (review.type || '').toLowerCase();
        if (type.includes('family') || type.includes('children')) {
            counts.family++;
        } else if (type.includes('couple') || type.includes('partner')) {
            counts.couple++;
        } else if (type.includes('friend') || type.includes('group') || type.includes('extended')) {
            counts.friendsGroup++;
        } else if (type.includes('solo') || type.includes('single')) {
            counts.solo++;
        } else if (type.includes('business') || type.includes('work')) {
            counts.business++;
        } else {
            // Default to couple if unspecified
            counts.couple++;
        }
    });

    const total = reviews.length;
    return {
        family: Math.round((counts.family / total) * 100),
        couple: Math.round((counts.couple / total) * 100),
        friendsGroup: Math.round((counts.friendsGroup / total) * 100),
        solo: Math.round((counts.solo / total) * 100),
        business: Math.round((counts.business / total) * 100)
    };
}
