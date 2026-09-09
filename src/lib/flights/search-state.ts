import type { FlightOffer } from '@/types/flights';

/**
 * What the results page is showing.
 *
 * `empty` and `provider_error` are the pair worth keeping apart: one is an answer
 * about the route, the other is the absence of an answer. They used to collapse into
 * the same "No flights found" panel, so an outage — or a search that lost its race
 * against a provider deadline — read as a finding, and the page offered nothing to
 * retry. That is what a traveller sees as flights disappearing.
 */
export type SearchOutcome =
    | { status: 'success'; offers: FlightOffer[] }
    | { status: 'empty' }
    | { status: 'provider_error' }
    | { status: 'error'; message: string };

/** Read one `/api/flights/search` response into the state the page should show. */
export function searchStateFromResponse(json: any): SearchOutcome {
    if (!json?.success) {
        return { status: 'error', message: json?.error || 'Search failed' };
    }

    const offers: FlightOffer[] = json.data?.offers ?? [];
    if (offers.length > 0) return { status: 'success', offers };

    return json.providersFailed ? { status: 'provider_error' } : { status: 'empty' };
}
