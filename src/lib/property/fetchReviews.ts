/**
 * Server-side data fetching utilities for hotel reviews.
 * Reads from the hotel_review_items table populated by the nightly ETG sync cron.
 */

import { createAdminClient } from '@/utils/supabase/admin';

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
}

export interface ReviewsData {
    reviews: HotelReview[];
    averageRating: number;
    totalCount: number;
}

// Sentiment analysis types for LiteAPI getSentiment=true response
export interface SentimentCategory {
    name: string;
    rating: number;
    description: string;
}

export interface SentimentAnalysis {
    categories: SentimentCategory[];
    pros: string[];
    cons: string[];
}

export interface ReviewsDataWithSentiment extends ReviewsData {
    sentimentAnalysis?: SentimentAnalysis;
}

// Pagination options for fetching reviews
export interface FetchReviewsOptions {
    limit?: number;
    offset?: number;
    getSentiment?: boolean;
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
 * Main fetch function for reviews — server-side.
 * Individual reviews come from LiteAPI (real-time, per-hotel endpoint).
 * Aggregate rating/count falls back to the ETG-synced hotel_reviews table.
 */
export async function fetchHotelReviews(
    hotelId: string,
    options: FetchReviewsOptions = {}
): Promise<ReviewsDataWithSentiment> {
    const { limit = 1000 } = options;
    // ETG stores numeric HIDs; TGX prefixes them with 'H' (e.g. H7002461 → 7002461)
    const etgId = hotelId.replace(/^H/i, '');

    try {
        const supabase = createAdminClient();

        const [liteApiResult, aggregateResult] = await Promise.all([
            // Fetch individual reviews from LiteAPI
            fetchLiteApiReviews(hotelId, limit),
            // Fetch aggregate rating from ETG-synced table
            supabase
                .from('hotel_reviews')
                .select('rating, reviews_count')
                .eq('hotel_id', etgId)
                .maybeSingle(),
        ]);

        const reviews = liteApiResult;
        const aggregate = aggregateResult.data;
        const averageRating = aggregate?.rating ?? calculateAverageRating(reviews);
        const totalCount = aggregate?.reviews_count ?? reviews.length;

        return { reviews, averageRating, totalCount };
    } catch (error) {
        console.error('[fetchHotelReviews] Error:', error);
        return { reviews: [], averageRating: 0, totalCount: 0 };
    }
}

async function fetchLiteApiReviews(hotelId: string, limit: number): Promise<HotelReview[]> {
    const apiKey = process.env.LITEAPI_KEY;
    if (!apiKey) {
        console.warn('[fetchLiteApiReviews] LITEAPI_KEY not set');
        return [];
    }
    try {
        const params = new URLSearchParams({ hotelId, limit: String(limit) });
        const res = await fetch(`https://api.liteapi.travel/v3.0/data/reviews?${params}`, {
            headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' },
            next: { revalidate: 3600 },
        });
        if (!res.ok) {
            console.error(`[fetchLiteApiReviews] ${res.status} for ${hotelId}`);
            return [];
        }
        const json = await res.json();
        const raw: any[] = json?.data || [];
        return raw.map(r => ({
            averageScore: r.averageScore ?? r.rating ?? 0,
            name: r.name || r.reviewer || 'Anonymous',
            date: r.date || '',
            headline: r.headline ?? undefined,
            pros: r.pros ?? undefined,
            cons: r.cons ?? undefined,
            country: r.country ?? undefined,
            type: r.type ?? r.travelerType ?? undefined,
            language: r.language ?? undefined,
        }));
    } catch (err) {
        console.error('[fetchLiteApiReviews] Error:', err);
        return [];
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
