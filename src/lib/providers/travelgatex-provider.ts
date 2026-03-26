/**
 * TravelgateX — SearchProvider stub.
 *
 * TravelgateX is a B2B travel API aggregator (GraphQL-based).
 * Docs: https://docs.travelgatex.com
 *
 * To activate: set TRAVELGATEX_API_KEY and TRAVELGATEX_CLIENT in .env
 *
 * Unlike ONDA, TravelgateX supports native city/destination search,
 * so the `destination` and `countryCode` params can be passed directly.
 */

import type { Property } from '@/types';
import type { SearchProvider, ProviderSearchParams } from './types';

const TRAVELGATEX_API_KEY = process.env.TRAVELGATEX_API_KEY ?? '';
const TRAVELGATEX_CLIENT = process.env.TRAVELGATEX_CLIENT ?? '';
// const TRAVELGATEX_BASE_URL = 'https://api.travelgatex.com';

export const travelgatexProvider: SearchProvider = {
    name: 'TravelgateX',

    isEnabled() {
        return !!(TRAVELGATEX_API_KEY && TRAVELGATEX_CLIENT);
    },

    async search(_params: ProviderSearchParams): Promise<Property[]> {
        // TODO: implement TravelgateX GraphQL search
        // Reference: https://docs.travelgatex.com/connectiontypedefs/searchrs/
        //
        // const query = `
        //   query HotelSearch($criteria: HotelCriteriaSearchInput!, $settings: HotelSettingsInput) {
        //     hotelX {
        //       search(criteria: $criteria, settings: $settings) {
        //         options { ... }
        //       }
        //     }
        //   }
        // `;
        //
        // const variables = {
        //   criteria: {
        //     checkIn: params.checkin,
        //     checkOut: params.checkout,
        //     destination: params.destination,
        //     paxes: [{ adults: params.adults, children: params.children }],
        //     nationality: 'KR',
        //     currency: params.currency,
        //   },
        //   settings: { client: TRAVELGATEX_CLIENT, context: 'ONDA' },
        // };
        //
        // const res = await fetch(TRAVELGATEX_BASE_URL, {
        //   method: 'POST',
        //   headers: {
        //     'Content-Type': 'application/json',
        //     'Authorization': `ApiKey ${TRAVELGATEX_API_KEY}`,
        //   },
        //   body: JSON.stringify({ query, variables }),
        // });
        // const data = await res.json();
        // return mapTravelgateXResults(data, params.currency);

        return [];
    },
};
