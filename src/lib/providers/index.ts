/**
 * Provider registry & aggregator.
 *
 * Providers are searched in parallel. Results are merged and deduplicated by
 * property id. If the same property appears in multiple providers the lowest
 * price wins.
 *
 * Adding a new provider:
 *  1. Create src/lib/providers/my-provider.ts implementing SearchProvider
 *  2. Import and add it to PROVIDERS below — that's it.
 */

import type { Property } from '@/types';
import type { ProviderSearchParams } from './types';
import { ondaProvider } from './onda-provider';
import { travelgatexProvider } from './travelgatex-provider';

const PROVIDERS = [
    ondaProvider,
    travelgatexProvider,
];

/**
 * Run all enabled providers in parallel and merge results.
 * Destination filtering (city name match) is applied here so every provider
 * benefits from it — providers that already do server-side geo-search will
 * naturally return relevant results, while ONDA's Korea-wide results get
 * filtered down when a destination is specified and properties have address data.
 */
export async function searchAllProviders(params: ProviderSearchParams): Promise<Property[]> {
    const active = PROVIDERS.filter(p => p.isEnabled());

    if (!active.length) {
        console.warn('[providers] No search providers are configured/enabled');
        return [];
    }

    // Run all providers in parallel
    const settled = await Promise.allSettled(
        active.map(async p => {
            try {
                const results = await p.search(params);
                console.log(`[providers] ${p.name} returned ${results.length} results`);
                return results;
            } catch (err) {
                console.error(`[providers] ${p.name} failed:`, err instanceof Error ? err.message : err);
                return [] as Property[];
            }
        })
    );

    // Merge all results
    const all: Property[] = settled.flatMap(r => r.status === 'fulfilled' ? r.value : []);

    // Deduplicate by id — keep lowest price
    const byId = new Map<string, Property>();
    for (const prop of all) {
        const existing = byId.get(prop.id);
        if (!existing || prop.price < existing.price) {
            byId.set(prop.id, prop);
        }
    }

    let merged = Array.from(byId.values());

    // Soft destination filter: if a destination is specified and we have enough
    // results, prefer properties whose address matches. Falls back to all results
    // so the user never sees an empty page just because a test hotel isn't in Seoul.
    if (params.destination && merged.length > 0) {
        const q = params.destination.toLowerCase().trim();
        const matching = merged.filter(p =>
            p.location?.toLowerCase().includes(q) ||
            p.name?.toLowerCase().includes(q)
        );
        // Only apply the filter if it returns results; otherwise show everything
        if (matching.length > 0) {
            merged = matching;
        }
    }

    return merged.sort((a, b) => a.price - b.price);
}
