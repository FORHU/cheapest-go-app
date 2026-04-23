// Types for properties and stays

export interface SimpleProperty {
    id: number;
    name: string;
    location: string;
    rating?: number;
    reviews?: number;
    originalPrice?: number;
    price: number;
    currency?: string;
    image: string;
    badge?: string;
    includes?: string[];
}

export interface RecentItem {
    id: string;
    destination: string;
    dates: string;
    type: string;
    image: string;
    price: number;
}

export interface Property {
    id: string;
    name: string;
    location: string;
    description: string;
    rating: number;
    reviews: number;
    price: number;
    currency?: string;
    originalPrice?: number;
    image: string;
    images: string[];
    amenities: string[];
    badges: string[];
    type: 'hotel' | 'apartment' | 'resort' | 'villa';
    coordinates: {
        lat: number;
        lng: number;
    };
    /** Cancellation policy tag from LiteAPI: "RFN" = refundable, "NRFN" = non-refundable */
    refundableTag?: 'RFN' | 'NRFN' | string;
    /** Distance from city centre in meters or km */
    distance?: string;
    /** Board/meal plan types from LiteAPI: "Breakfast included", "Room only", etc. */
    boardTypes?: string[];
    /** City name from the search query — used for flight bundle upsell destination */
    city?: string;
    /** Source provider */
    provider?: 'travelgatex' | 'duffel';
    /** Duffel rate ID — required to create a quote/booking for Duffel-sourced hotels */
    rateId?: string;
    /** TravelgateX booking metadata — required for quote/book flow */
    _tgx?: {
        optionId: string;
        token: string;
        accessCode: string;
        supplierCode?: string;
        boardCode?: string;
        rateRules?: string[];
    };
}

export const uniqueTabs = ['Tents', 'Boats', 'Tree House', 'Resorts'];
