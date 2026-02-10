/**
 * Centralized LiteAPI gateway.
 * ALL Supabase Edge Function calls go through this file.
 * No other file should import from `@/utils/supabase/functions` directly.
 */

import { invokeEdgeFunction } from '@/utils/supabase/functions';

// ============================================================================
// Search & Autocomplete
// ============================================================================

export async function autocompleteLiteApi(keyword: string) {
    return invokeEdgeFunction('liteapi-autocomplete', { keyword });
}

export async function searchLiteApi(params: Record<string, unknown>) {
    return invokeEdgeFunction('liteapi-search', params);
}

// ============================================================================
// Booking
// ============================================================================

export async function prebookLiteApi(params: Record<string, unknown>) {
    return invokeEdgeFunction('liteapi-prebook-v2', params);
}

export async function bookLiteApi(params: Record<string, unknown>) {
    return invokeEdgeFunction('liteapi-book-v2', params);
}

export async function cancelBookingLiteApi(params: { bookingId: string }) {
    return invokeEdgeFunction('liteapi-cancel-booking', params);
}

export async function amendBookingLiteApi(params: Record<string, unknown>) {
    return invokeEdgeFunction('liteapi-amend-booking', params);
}

export async function getBookingDetailsLiteApi(params: { bookingId: string }) {
    return invokeEdgeFunction('liteapi-booking-details', params);
}

// ============================================================================
// Vouchers
// ============================================================================

export async function listVouchersLiteApi() {
    return invokeEdgeFunction<{ success: boolean; data: any }>(
        'liteapi-vouchers',
        { action: 'list' }
    );
}

// ============================================================================
// Reviews
// ============================================================================

export async function getHotelReviewsLiteApi(params: {
    hotelId: string;
    limit?: number;
    offset?: number;
    getSentiment?: boolean;
}) {
    return invokeEdgeFunction('liteapi-reviews', params);
}
