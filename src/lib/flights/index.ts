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

const registry = new ProviderRegistry();

/**
 * Global flight search orchestrator — singleton.
 * Use this in API routes to search across all providers.
 */
export const flightOrchestrator = new FlightSearchOrchestrator(registry);

/**
 * Export registry for health checks and diagnostics.
 */
export { registry as flightRegistry };
