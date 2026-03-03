import type {
    FlightSearchResponse,
    FlightOffer,
    FlightPrice,
} from '../types';
import type {
    IFlightProvider,
    SearchFlightsParams,
    GetFlightDetailsParams,
    RevalidatePriceParams,
    CreateBookingParams,
    IssueTicketParams,
    FlightDetails,
    RevalidatePriceResult,
    CreateBookingResult,
    IssueTicketResult,
} from '../providers/flightProvider.interface';
import { FlightProviderError } from '../providers/flightProvider.interface';

// ─── Configuration ───────────────────────────────────────────────────

export interface FlightEngineConfig {
    /** Maximum time (ms) to wait for any single provider before timing out */
    providerTimeoutMs: number;
    /** Maximum number of offers to return after merge */
    maxResults: number;
    /** Whether to include provider metadata in the response */
    includeProviderMeta: boolean;
}

const DEFAULT_CONFIG: FlightEngineConfig = {
    providerTimeoutMs: 15_000,
    maxResults: 50,
    includeProviderMeta: true,
};

// ─── Provider Status ─────────────────────────────────────────────────

export interface ProviderStatus {
    name: string;
    displayName: string;
    enabled: boolean;
    offerCount: number;
    latencyMs: number;
    error?: string;
}

// ─── Engine Result ───────────────────────────────────────────────────

export interface FlightEngineResult {
    offers: FlightOffer[];
    totalResults: number;
    providers: ProviderStatus[];
    searchTimestamp: string;
    searchDurationMs: number;
}

// ─── Deduplication Key ───────────────────────────────────────────────

function deduplicationKey(offer: FlightOffer): string {
    return offer.segments
        .map(s => `${s.flightNumber}|${s.departure.time}|${s.arrival.time}`)
        .join('→');
}

// ─── Timeout Wrapper ─────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new FlightProviderError(`${label} timed out after ${ms}ms`, label, 'TIMEOUT', undefined, true)),
            ms,
        );
        promise.then(
            val => { clearTimeout(timer); resolve(val); },
            err => { clearTimeout(timer); reject(err); },
        );
    });
}

// ─── Flight Engine ───────────────────────────────────────────────────

export class FlightEngine {
    private providers: IFlightProvider[] = [];
    private config: FlightEngineConfig;

    constructor(config: Partial<FlightEngineConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    // Register a provider. Skips if disabled.
    registerProvider(provider: IFlightProvider): void {
        if (!provider.enabled) {
            console.log(`[FlightEngine] Skipped disabled provider: ${provider.name}`);
            return;
        }
        // Avoid duplicate registration
        if (this.providers.some(p => p.name === provider.name)) {
            console.warn(`[FlightEngine] Provider already registered: ${provider.name}`);
            return;
        }
        this.providers.push(provider);
        this.providers.sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));
        console.log(`[FlightEngine] Registered: ${provider.name} (priority ${provider.priority ?? 50})`);
    }

    // Remove a provider by name.
    removeProvider(name: string): void {
        this.providers = this.providers.filter(p => p.name !== name);
    }

    // Get all registered providers and their enabled state.
    getProviders(): Pick<IFlightProvider, 'name' | 'displayName' | 'enabled' | 'priority'>[] {
        return this.providers.map(p => ({
            name: p.name,
            displayName: p.displayName,
            enabled: p.enabled,
            priority: p.priority,
        }));
    }

    // ─── Search ──────────────────────────────────────────────────

    // Query all active providers in parallel, normalize, merge, deduplicate, and sort by price.
    async search(params: SearchFlightsParams): Promise<FlightEngineResult> {
        const start = Date.now();
        const activeProviders = this.providers.filter(p => p.enabled);

        if (activeProviders.length === 0) {
            return this.emptyResult(start);
        }

        console.log(`[FlightEngine] Searching ${activeProviders.length} provider(s): ${activeProviders.map(p => p.name).join(', ')}`);

        // Fire all providers in parallel with individual timeouts
        const settled = await Promise.allSettled(
            activeProviders.map(provider => {
                const providerStart = Date.now();
                return withTimeout(
                    provider.searchFlights(params),
                    this.config.providerTimeoutMs,
                    provider.name,
                ).then(response => ({
                    provider,
                    response,
                    latencyMs: Date.now() - providerStart,
                }));
            }),
        );

        // Collect offers and provider statuses
        const allOffers: FlightOffer[] = [];
        const statuses: ProviderStatus[] = [];

        for (let i = 0; i < settled.length; i++) {
            const result = settled[i];
            const provider = activeProviders[i];

            if (result.status === 'fulfilled') {
                const { response, latencyMs } = result.value;
                allOffers.push(...response.offers);
                statuses.push({
                    name: provider.name,
                    displayName: provider.displayName,
                    enabled: true,
                    offerCount: response.offers.length,
                    latencyMs,
                });
            } else {
                const errMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
                console.error(`[FlightEngine] ${provider.name} failed: ${errMsg}`);
                statuses.push({
                    name: provider.name,
                    displayName: provider.displayName,
                    enabled: true,
                    offerCount: 0,
                    latencyMs: Date.now() - start,
                    error: errMsg,
                });
            }
        }

        // Deduplicate — keep the cheapest when the same flight appears from multiple providers
        const deduped = this.deduplicate(allOffers);

        // Sort by price ascending
        deduped.sort((a, b) => a.price.total - b.price.total);

        // Trim to max results
        const capped = deduped.slice(0, this.config.maxResults);

        return {
            offers: capped,
            totalResults: capped.length,
            providers: statuses,
            searchTimestamp: new Date().toISOString(),
            searchDurationMs: Date.now() - start,
        };
    }

    // ─── Detail / Revalidate / Book / Ticket ─────────────────────

    // Route to the correct provider based on the offer ID prefix.
    private resolveProvider(offerId: string): IFlightProvider {
        const prefix = offerId.split('_')[0];
        const provider = this.providers.find(p => p.name === prefix);
        if (!provider) {
            throw new FlightProviderError(`No provider found for offer: ${offerId}`, prefix, 'VALIDATION_ERROR');
        }
        return provider;
    }

    // Get full details for an offer from its originating provider.
    async getFlightDetails(params: GetFlightDetailsParams): Promise<FlightDetails> {
        const provider = this.resolveProvider(params.offerId);
        return withTimeout(
            provider.getFlightDetails(params),
            this.config.providerTimeoutMs,
            provider.name,
        );
    }

    // Revalidate (reprice) an offer before booking.
    async revalidateFlightPrice(params: RevalidatePriceParams): Promise<RevalidatePriceResult> {
        const provider = this.resolveProvider(params.offerId);
        return withTimeout(
            provider.revalidateFlightPrice(params),
            this.config.providerTimeoutMs,
            provider.name,
        );
    }

    // Create a booking on the originating provider.
    async createBooking(params: CreateBookingParams): Promise<CreateBookingResult> {
        const provider = this.resolveProvider(params.offerId);
        return withTimeout(
            provider.createBooking(params),
            this.config.providerTimeoutMs,
            provider.name,
        );
    }

    // Issue tickets on the originating provider.
    async issueTicket(params: IssueTicketParams): Promise<IssueTicketResult> {
        const bookingPrefix = params.bookingId.substring(0, 3).toLowerCase();
        // Duffel bookings start with "DBK", Mystifly with "FBK", etc.
        // Fall back to first available provider if prefix doesn't match.
        let provider = this.providers.find(p => {
            if (bookingPrefix === 'dbk') return p.name === 'duffel';
            if (bookingPrefix === 'fbk') return p.name === 'mystifly';
            return false;
        });
        if (!provider) provider = this.providers[0];
        if (!provider) {
            throw new FlightProviderError('No providers available for ticketing', 'engine', 'TICKETING_FAILED');
        }
        return withTimeout(
            provider.issueTicket(params),
            this.config.providerTimeoutMs,
            provider.name,
        );
    }

    // ─── Private Helpers ─────────────────────────────────────────

    private deduplicate(offers: FlightOffer[]): FlightOffer[] {
        const seen = new Map<string, FlightOffer>();
        for (const offer of offers) {
            const key = deduplicationKey(offer);
            const existing = seen.get(key);
            if (!existing || offer.price.total < existing.price.total) {
                seen.set(key, offer);
            }
        }
        return Array.from(seen.values());
    }

    private emptyResult(start: number): FlightEngineResult {
        return {
            offers: [],
            totalResults: 0,
            providers: [],
            searchTimestamp: new Date().toISOString(),
            searchDurationMs: Date.now() - start,
        };
    }
}
