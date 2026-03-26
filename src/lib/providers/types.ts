/**
 * Provider abstraction layer for hotel search.
 *
 * Each provider (ONDA, TravelgateX, etc.) implements SearchProvider.
 * fetchSearchProperties() aggregates results from all active providers.
 */

import type { Property } from '@/types';

export interface ProviderSearchParams {
    checkin: string;           // yyyy-mm-dd
    checkout: string;          // yyyy-mm-dd
    adults: number;
    children: number;
    childrenAges?: number[];
    destination?: string;      // City/region name (used by providers that support geo-search)
    countryCode?: string;      // ISO 3166-1 alpha-2 (used by providers that support it)
    currency: string;          // ISO 4217
}

export interface SearchProvider {
    /** Unique identifier shown in logs */
    name: string;
    /** Whether this provider is configured and active */
    isEnabled(): boolean;
    /** Fetch available properties for the given search params */
    search(params: ProviderSearchParams): Promise<Property[]>;
}
