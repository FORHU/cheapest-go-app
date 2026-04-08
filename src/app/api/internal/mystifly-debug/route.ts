import { NextResponse } from 'next/server';
import { mystiflyRequest } from '@/lib/server/flights/mystifly-client';
import { env } from '@/utils/env';

// Temporary debug endpoint — DELETE after finding SearchIdentifier field location
// Usage: GET /api/internal/mystifly-debug
export async function GET() {
    // Search CRK→CJU (the route that was returning fares)
    const departDate = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0];

    const raw: any = await mystiflyRequest('/api/v1/Search/Flight', {
        Target: env.MYSTIFLY_TARGET || 'Production',
        OriginDestinationInformations: [{
            DepartureDateTime: `${departDate}T00:00:00`,
            OriginLocationCode: 'CRK',
            DestinationLocationCode: 'CJU',
        }],
        PassengerTypeQuantities: [{ Code: 'ADT', Quantity: 1 }],
        NearByAirports: true,
        CurrencyCode: 'USD',
        TravelPreferences: {
            AirTripType: 'OneWay',
            CabinPreference: 'Y',
            MaxStopsQuantity: 'All',
            PreferenceLevel: 'Preferred',
            Preferences: { CabinClassPreference: { CabinType: 'Y', PreferenceLevel: 'Preferred' } },
            CurrencyCode: 'USD',
        },
        RequestOptions: 'Fifty',
    });

    const itinData = raw.Data?.FareItineraries ?? raw.Data?.PricedItineraries ?? [];
    const firstItin = itinData[0] ?? null;

    return NextResponse.json({
        success: raw.Success,
        message: raw.Message,
        topLevelKeys: Object.keys(raw),
        dataKeys: raw.Data ? Object.keys(raw.Data) : [],
        firstItinKeys: firstItin ? Object.keys(firstItin) : [],
        firstItinFareItineraryKeys: firstItin?.FareItinerary ? Object.keys(firstItin.FareItinerary) : [],
        firstItinAirItineraryFareInfoKeys: firstItin?.FareItinerary?.AirItineraryFareInfo
            ? Object.keys(firstItin.FareItinerary.AirItineraryFareInfo)
            : [],
        // Candidate fields
        rawSearchIdentifier: raw.SearchIdentifier,
        dataSearchIdentifier: raw.Data?.SearchIdentifier,
        dataTraceId: raw.Data?.TraceId,
        dataSearchId: raw.Data?.SearchId,
        dataConversationId: raw.Data?.ConversationId,
        airSearchStatistics: raw.Data?.AirSearchStatistics,
        firstItinSearchIdentifier: firstItin?.SearchIdentifier,
        firstFareSourceCode: firstItin?.FareItinerary?.AirItineraryFareInfo?.FareSourceCode?.slice(0, 40),
        resultCount: itinData.length,
    });
}
