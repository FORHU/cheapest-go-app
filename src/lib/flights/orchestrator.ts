/**
 * Flight Search Orchestrator
 *
 * Queries all enabled providers in parallel, merges and deduplicates results,
 * and returns a unified sorted list of flight offers.
 */

import type { ProviderRegistry } from './provider';
import type { FlightSearchRequest, FlightOffer, FlightSearchResponse } from './types';

export interface OrchestratorResult {
    /** Merged flight offers from all providers, sorted by price */
    offers: FlightOffer[];
    /** Per-provider metadata */
    providers: {
        name: string;
        offerCount: number;
        searchId: string;
        error?: string;
    }[];
    /** Total results across all providers */
    totalResults: number;
    /** Search timestamp */
    timestamp: string;
}

export class FlightSearchOrchestrator {
    constructor(private registry: ProviderRegistry) { }

    /**
     * Search all enabled providers in parallel.
     * Uses Promise.allSettled so one provider's failure doesn't block others.
     */
    async search(request: FlightSearchRequest): Promise<OrchestratorResult> {
        const providers = this.registry.getAll();

        if (providers.length === 0) {
            console.warn('[Orchestrator] No providers registered');
            return {
                offers: [],
                providers: [],
                totalResults: 0,
                timestamp: new Date().toISOString(),
            };
        }

        console.log(`[Orchestrator] Searching ${providers.length} provider(s): ${providers.map(p => p.name).join(', ')}`);

        // Query all providers in parallel
        const results = await Promise.allSettled(
            providers.map(provider =>
                provider.search(request).then(res => ({
                    provider: provider.name,
                    response: res,
                }))
            )
        );

        // Collect results
        const allOffers: FlightOffer[] = [];
        const providerMeta: OrchestratorResult['providers'] = [];

        for (const result of results) {
            if (result.status === 'fulfilled') {
                const { provider, response } = result.value;
                allOffers.push(...response.offers);
                providerMeta.push({
                    name: provider,
                    offerCount: response.offers.length,
                    searchId: response.metadata.searchId,
                });
                console.log(`[Orchestrator] ${provider}: ${response.offers.length} offers`);
            } else {
                // Extract provider name from error context
                const errorMsg = result.reason?.message || String(result.reason);
                console.error(`[Orchestrator] Provider failed:`, errorMsg);
                providerMeta.push({
                    name: 'unknown',
                    offerCount: 0,
                    searchId: '',
                    error: errorMsg,
                });
            }
        }

        // Deduplicate (same airline + flight numbers + times)
        const deduped = this.deduplicate(allOffers);

        // Sort by price ascending
        deduped.sort((a, b) => a.price.total - b.price.total);

        return {
            offers: deduped,
            providers: providerMeta,
            totalResults: deduped.length,
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Deduplicate offers that represent the same flight.
     * Key: airline + flight numbers + departure times
     * When duplicates found, keep the one with the lowest price.
     */
    private deduplicate(offers: FlightOffer[]): FlightOffer[] {
        const seen = new Map<string, FlightOffer>();

        for (const offer of offers) {
            const key = this.getDeduplicationKey(offer);
            const existing = seen.get(key);

            if (!existing || offer.price.total < existing.price.total) {
                seen.set(key, offer);
            }
        }

        return Array.from(seen.values());
    }

    private getDeduplicationKey(offer: FlightOffer): string {
        return offer.segments
            .map(s => `${s.flightNumber}|${s.departure.time}|${s.arrival.time}`)
            .join('→');
    }
}
