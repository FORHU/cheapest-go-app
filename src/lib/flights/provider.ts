import type { FlightSearchRequest, FlightSearchResponse, FlightBookingRequest, FlightBookingResponse } from './types';

// ─── Provider Interface ──────────────────────────────────────────────

export interface FlightProvider {
    /** Unique provider identifier (e.g. "amadeus", "mystifly") */
    readonly name: string;

    /** Human-readable display name */
    readonly displayName: string;

    /** Whether this provider is currently enabled and ready */
    readonly enabled: boolean;

    /**
     * Search for flight offers.
     * Must normalize all results into FlightOffer[] format.
     */
    search(request: FlightSearchRequest): Promise<FlightSearchResponse>;

    /**
     * Book a specific offer.
     * Optional — not all providers may support direct booking.
     */
    book?(request: FlightBookingRequest): Promise<FlightBookingResponse>;

    /**
     * Health check — verify API credentials and connectivity.
     * Returns true if the provider is operational.
     */
    healthCheck?(): Promise<boolean>;
}

// ─── Provider Registry ───────────────────────────────────────────────

export class ProviderRegistry {
    private providers: Map<string, FlightProvider> = new Map();

    /**
     * Register a flight provider.
     * Silently skips disabled providers (missing credentials, etc.)
     */
    register(provider: FlightProvider): void {
        if (!provider.enabled) {
            console.log(`[FlightRegistry] Skipping disabled provider: ${provider.name}`);
            return;
        }
        this.providers.set(provider.name, provider);
        console.log(`[FlightRegistry] Registered provider: ${provider.name}`);
    }

    /**
     * Get a specific provider by name.
     */
    get(name: string): FlightProvider | undefined {
        return this.providers.get(name);
    }

    /**
     * Get all enabled providers.
     */
    getAll(): FlightProvider[] {
        return Array.from(this.providers.values());
    }

    /**
     * Get provider names.
     */
    getNames(): string[] {
        return Array.from(this.providers.keys());
    }

    /**
     * Check if any providers are registered.
     */
    hasProviders(): boolean {
        return this.providers.size > 0;
    }

    /**
     * Run health checks on all registered providers.
     */
    async healthCheckAll(): Promise<Record<string, boolean>> {
        const results: Record<string, boolean> = {};
        const entries = Array.from(this.providers.entries());
        for (let i = 0; i < entries.length; i++) {
            const [name, provider] = entries[i];
            try {
                results[name] = provider.healthCheck
                    ? await provider.healthCheck()
                    : true; // Assume healthy if no health check
            } catch {
                results[name] = false;
            }
        }
        return results;
    }
}
