/**
 * ONDA Channel Partner API — SearchProvider implementation.
 *
 * ONDA is a Korean B2B accommodation API (25,000+ properties).
 * It does NOT support geo/city search — results cover all Korean properties.
 * Destination filtering is handled downstream by the aggregator.
 *
 * Dev environment: only test properties 117417 & 120135 are accessible.
 * Production: all properties under the contracted channel are available.
 */

import type { Property } from '@/types';
import type { SearchProvider, ProviderSearchParams } from './types';
import {
    ondaSearchAvailableProperties,
    ondaGetProperty,
    mapOndaPropertyToProperty,
    ONDA_API_KEY,
} from '@/lib/server/onda';

const BATCH_SIZE = 10;
const MAX_RESULTS = 20;
const TOP_AVAILABLE = 30;

export const ondaProvider: SearchProvider = {
    name: 'ONDA',

    isEnabled() {
        return !!ONDA_API_KEY;
    },

    async search(params: ProviderSearchParams): Promise<Property[]> {
        const { checkin, checkout, adults, childrenAges } = params;

        // Step 1: Get available properties + prices for the dates
        const available = await ondaSearchAvailableProperties({
            checkin,
            checkout,
            adult: adults,
            childrenAges,
        });

        if (!available.length) return [];

        // Step 2: Sort by lowest sale price, take top N with real prices
        const sorted = available
            .filter(p => p.sale_price > 0)
            .sort((a, b) => a.sale_price - b.sale_price)
            .slice(0, TOP_AVAILABLE);

        if (!sorted.length) return [];

        // Step 3: Fetch property details in parallel batches
        const detailed: Array<{ property: Awaited<ReturnType<typeof ondaGetProperty>>; price: number }> = [];

        for (let i = 0; i < sorted.length; i += BATCH_SIZE) {
            const batch = sorted.slice(i, i + BATCH_SIZE);
            const results = await Promise.allSettled(
                batch.map(p => ondaGetProperty(p.property_id))
            );
            for (let j = 0; j < results.length; j++) {
                const r = results[j];
                if (r.status === 'fulfilled') {
                    detailed.push({ property: r.value, price: sorted[i + j].sale_price });
                }
            }
        }

        // Step 4: Map to Property[]
        return detailed.slice(0, MAX_RESULTS).map(({ property, price }) =>
            mapOndaPropertyToProperty(property, price)
        );
    },
};

export { ONDA_API_KEY };
