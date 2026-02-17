/**
 * Flight System Bootstrap
 *
 * Instantiates providers, registers them, and exports the orchestrator.
 * Import from here in API routes and hooks.
 */

// Types (re-exported for convenience)
export type {
    FlightSearchRequest,
    FlightSearchResponse,
    FlightOffer,
    FlightSegmentDetail,
    FlightPrice,
    FlightPassengers,
    FlightBookingRequest,
    FlightBookingResponse,
    FlightBookingPassenger,
    CabinClass,
} from './types';

export { AIRLINES, getAirlineName } from './types';
export type { FlightProvider } from './provider';
export { ProviderRegistry } from './provider';
export { FlightSearchOrchestrator } from './orchestrator';
export type { OrchestratorResult } from './orchestrator';

// ─── Provider Registration ───────────────────────────────────────────

import { ProviderRegistry } from './provider';
import { FlightSearchOrchestrator } from './orchestrator';
import { MockProvider } from './providers/mock';
import { AmadeusProvider } from './providers/amadeus';

/**
 * Global provider registry — singleton.
 * Providers self-disable when credentials are missing.
 */
const registry = new ProviderRegistry();

// Always register Amadeus first (self-disables if no credentials)
registry.register(new AmadeusProvider());

// Mock provider as fallback (always enabled)
registry.register(new MockProvider());

/**
 * Global flight search orchestrator — singleton.
 * Use this in API routes to search across all providers.
 */
export const flightOrchestrator = new FlightSearchOrchestrator(registry);

/**
 * Export registry for health checks and diagnostics.
 */
export { registry as flightRegistry };
