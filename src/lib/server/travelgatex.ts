/**
 * Centralized TravelgateX gateway.
 * ALL TravelgateX Edge Function calls go through this file.
 */

import { invokeEdgeFunction } from '@/utils/supabase/functions';

// ============================================================================
// Search
// ============================================================================

export async function searchTravelgateX(params: object, onChunk?: (chunk: any) => void) {
    return invokeEdgeFunction('travelgatex-search', params, onChunk);
}

// ============================================================================
// Destinations (autocomplete)
// ============================================================================

export async function searchTravelgateXDestinations(keyword: string) {
    return invokeEdgeFunction('travelgatex-destinations', { keyword });
}

// ============================================================================
// Quote (pre-book price confirmation)
// ============================================================================

export async function quoteTravelgateX(params: { token: string }) {
    return invokeEdgeFunction('travelgatex-quote', params);
}

// ============================================================================
// Book
// ============================================================================

export async function bookTravelgateX(params: {
    quoteToken: string;
    clientReference: string;
    holder: { firstName: string; lastName: string; email: string };
    rooms: Array<{ occupancyRefId: number; paxes: Array<{ name: string; surname: string; age: number }> }>;
}) {
    return invokeEdgeFunction('travelgatex-book', params);
}

// ============================================================================
// Cancel
// ============================================================================

export async function cancelTravelgateX(params: {
    clientReference: string;
    supplierReference?: string;
}) {
    return invokeEdgeFunction('travelgatex-cancel', params);
}
