/**
 * Centralized TravelgateX gateway.
 * ALL TravelgateX Edge Function calls go through this file.
 */

import { invokeEdgeFunction } from '@/utils/supabase/functions';

// ============================================================================
// Search
// ============================================================================

export async function searchTravelgateX(params: object) {
    return invokeEdgeFunction('travelgatex-search', params);
}

// ============================================================================
// Destinations (autocomplete)
// ============================================================================

export async function searchTravelgateXDestinations(keyword: string) {
    return invokeEdgeFunction('travelgatex-destinations', { keyword });
}
