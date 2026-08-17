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
    /** Hotel category star rating (1–5, from supplier static content) */
    starRating?: number;
    /** Source provider */
    provider?: 'travelgatex' | 'duffel';
    /** True while TGX pricing is still loading — card shows skeleton instead of ₩0 */
    priceLoading?: boolean;
    /** Duffel rate ID — required to create a quote/booking for Duffel-sourced hotels */
    rateId?: string;
    /** Supplier offer token (e.g. "TGX:…") — passed to property page so it can restore the exact search rate */
    offerId?: string;
    /** TravelgateX booking metadata — required for quote/book flow */
    _tgx?: {
        optionId: string;
        token: string;
        accessCode: string;
        supplierCode?: string;
        boardCode?: string;
        rateRules?: string[];
    };
    /** Hotel check-in time (e.g. "15:00") */
    checkIn?: string;
    /** Hotel check-out time (e.g. "12:00") */
    checkOut?: string;
    /** Important information / special instructions for guests */
    importantInformation?: string;
    /** Contact details from TGX static content */
    contactEmail?: string;
    contactPhone?: string;
    contactWeb?: string;
    /** Structured amenity groups from TGX allAmenities */
    amenityGroups?: Array<{ amenityCode: string; type?: string; texts?: Array<{ language: string; text: string }> }>;
    /** GIATA global hotel ID */
    giataId?: string;
    /** Hotel chain code */
    chainCode?: string;
}

export const uniqueTabs = ['Tents', 'Boats', 'Tree House', 'Resorts'];
