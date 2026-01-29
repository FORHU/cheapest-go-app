import { invokeEdgeFunction } from '@/utils/supabase/client-functions';

/**
 * Search parameters for hotel search
 */
export interface SearchParams {
  cityName?: string;
  countryCode?: string;
  placeId?: string;
  checkin: string;
  checkout: string;
  adults: number;
  children: number;
  currency: string;
  guest_nationality: string;
}

/**
 * Parameters for fetching hotel details
 */
export interface HotelDetailsParams {
  hotelId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
}

/**
 * LiteAPI service for hotel search and details
 * Wraps Supabase Edge Functions for clean separation
 */
export const liteApiService = {
  /**
   * Search for hotels based on location and dates
   */
  searchHotels: async (params: SearchParams) => {
    const result = await invokeEdgeFunction('liteapi-search', params);
    return result.data;
  },

  /**
   * Get detailed information about a specific hotel
   */
  getHotelDetails: async (params: HotelDetailsParams) => {
    // This wraps the existing getHotelDetails logic from functions.ts
    // For now, we'll keep using the server-side function
    // In future, we can migrate this to a client-side React Query hook
    const result = await invokeEdgeFunction('liteapi-hotel-details', params);
    return result.data;
  },
};
