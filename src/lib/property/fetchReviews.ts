/**
 * Server-side data fetching utilities for hotel reviews.
 *
 * ETG (OTV / RateHawk) does NOT expose a per-hotel live reviews endpoint.
 * Their only reviews API is a bulk nightly dump:
 *   POST https://api.worldota.net/api/b2b/v3/hotel/reviews/dump/
 *
 * That dump is consumed by the nightly cron at /api/cron/etg-reviews-sync and
 * stored in two Supabase tables:
 *   - hotel_review_items  — individual guest reviews
 *   - hotel_reviews       — aggregate rating + review count
 *
 * All review reads go directly to those tables. No live ETG call is made here.
 */

import { createAdminClient } from '@/utils/postgres/admin';

// ── Types ─────────────────────────────────────────────────────────────────────

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

// Kept for backward-compat with property page import
export interface ReviewsDataWithSentiment extends ReviewsData {}

export interface FetchReviewsOptions {
    limit?: number;
    offset?: number;
}

// ── Supabase (ETG nightly cache) ──────────────────────────────────────────────

async function fetchSupabaseReviews(
    etgId: string,
    limit: number
): Promise<{ reviews: HotelReview[]; averageRating: number | null; totalCount: number | null }> {
    try {
        const supabase = createAdminClient();

        const [reviewsResult, aggregateResult] = await Promise.all([
            supabase
                .from('hotel_review_items')
                .select('reviewer_name, review_date, score, pros, cons, traveler_type, language, headline, country')
                .eq('hotel_id', etgId)
                .order('review_date', { ascending: false })
                .limit(limit),
            supabase
                .from('hotel_reviews')
                .select('rating, reviews_count')
                .eq('hotel_id', etgId)
                .maybeSingle(),
        ]);

        const reviews: HotelReview[] = (reviewsResult.data ?? []).map((r: any) => ({
            averageScore: r.score ?? 0,
            name:     r.reviewer_name  || 'Anonymous',
            date:     r.review_date    || '',
            headline: r.headline       ?? undefined,
            pros:     r.pros           ?? undefined,
            cons:     r.cons           ?? undefined,
            country:  r.country        ?? undefined,
            type:     r.traveler_type  ?? undefined,
            language: r.language       ?? undefined,
        }));

        return {
            reviews,
            averageRating: aggregateResult.data?.rating        ?? null,
            totalCount:    aggregateResult.data?.reviews_count ?? null,
        };
    } catch (err) {
        console.error('[fetchSupabaseReviews] Error:', err);
        return { reviews: [], averageRating: null, totalCount: null };
    }
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Fetch hotel reviews for a property page.
 *
 * Reads from the Supabase ETG cache tables populated by the nightly cron
 * (/api/cron/etg-reviews-sync). ETG does not provide a per-hotel live
 * reviews endpoint — the bulk dump + cache is the only available path.
 *
 * `hotelId` accepts both TGX-prefixed (`H7002461`) and bare numeric (`7002461`).
 */
export async function fetchHotelReviews(
    hotelId: string,
    options: FetchReviewsOptions = {}
): Promise<ReviewsDataWithSentiment> {
    const { limit = 1000 } = options;
    // Strip TGX 'H' prefix → bare numeric ETG HID (H7002461 → 7002461)
    const etgId = hotelId.replace(/^H/i, '');

    const source = await fetchSupabaseReviews(etgId, limit);

    const averageRating = source.averageRating ?? calculateAverageRating(source.reviews);
    const totalCount    = source.totalCount    ?? source.reviews.length;

    return { reviews: source.reviews, averageRating, totalCount };
}

// ── UI helpers ────────────────────────────────────────────────────────────────

export function calculateAverageRating(reviews: HotelReview[]): number {
    if (!reviews || reviews.length === 0) return 0;
    const sum = reviews.reduce((acc, r) => acc + (r.averageScore || 0), 0);
    return Math.round((sum / reviews.length) * 10) / 10;
}

export function formatReviewDate(dateStr: string): string {
    try {
        return new Date(dateStr).toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric',
        });
    } catch {
        return dateStr;
    }
}

export function getReviewerInitials(name: string): string {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function getRatingLabel(score: number): string {
    if (score >= 9) return 'exceptional';
    if (score >= 8) return 'excellent';
    if (score >= 7) return 'veryGood';
    if (score >= 6) return 'good';
    if (score >= 5) return 'average';
    return 'belowAverage';
}

export function getRatingColor(score: number): string {
    if (score >= 9) return 'bg-indigo-600';  // Exceptional
    if (score >= 8) return 'bg-emerald-500'; // Excellent
    if (score >= 7) return 'bg-teal-500';    // Very Good
    if (score >= 6) return 'bg-blue-500';    // Good
    return 'bg-amber-500';                   // Average / Below
}

export interface TravelerBreakdown {
    family:       number;
    couple:       number;
    friendsGroup: number;
    solo:         number;
    business:     number;
}

export function calculateTravelerBreakdown(reviews: HotelReview[]): TravelerBreakdown {
    if (!reviews || reviews.length === 0) {
        return { family: 0, couple: 0, friendsGroup: 0, solo: 0, business: 0 };
    }

    const counts = { family: 0, couple: 0, friendsGroup: 0, solo: 0, business: 0 };
    for (const review of reviews) {
        const t = (review.type || '').toLowerCase();
        if      (t.includes('family')   || t.includes('children')) counts.family++;
        else if (t.includes('couple')   || t.includes('partner'))  counts.couple++;
        else if (t.includes('friend')   || t.includes('group') || t.includes('extended')) counts.friendsGroup++;
        else if (t.includes('solo')     || t.includes('single'))   counts.solo++;
        else if (t.includes('business') || t.includes('work'))     counts.business++;
        else counts.couple++;
    }

    const total = reviews.length;
    return {
        family:       Math.round((counts.family       / total) * 100),
        couple:       Math.round((counts.couple       / total) * 100),
        friendsGroup: Math.round((counts.friendsGroup / total) * 100),
        solo:         Math.round((counts.solo         / total) * 100),
        business:     Math.round((counts.business     / total) * 100),
    };
}
