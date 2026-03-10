/**
 * Types for the Flight Search and Caching system.
 * Based on Phase 1 Data Architecture.
 */

export type CabinClass = 'economy' | 'premium_economy' | 'business' | 'first';

export interface FlightSearch {
  id: string;
  user_id?: string;
  origin: string;
  destination: string;
  departure_date: string;
  return_date?: string;
  adults: number;
  children: number;
  infants: number;
  cabin_class: CabinClass;
  created_at: string;
}

export interface FlightResultCache {
  id: string;
  search_id?: string;
  provider: 'duffel' | 'mystifly';
  offer_id: string;
  price: number;
  currency: string;
  airline: string;
  departure_time: string;
  arrival_time: string;
  duration: number; // In minutes
  stops: number;
  remaining_seats: number | null;
  raw: any; // Original provider response
  created_at?: string;
}

export interface FlightSearchParams {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  adults: number;
  children: number;
  infants: number;
  cabinClass: CabinClass;
  searchId?: string;
}
