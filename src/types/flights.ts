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

export interface FlightResult {
  provider: string;
  offer_id: string;
  price: number;
  currency: string;
  airline: string;
  departure_time: string;
  arrival_time: string;
  duration: number; // In minutes
  stops: number;
  remaining_seats: number | null;
  traceId?: string;
  raw: any; // Original provider response
}

export interface FlightResultCache extends FlightResult {
  id: string;
  search_id?: string;
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

// ─── Flight Engine V2 Types (Migrated from legacy) ────────────────

export interface FlightSearchRequest {
  tripType: 'one-way' | 'round-trip' | 'multi-city';
  segments: FlightSearchSegment[];
  passengers: FlightPassengers;
  cabinClass: CabinClass;
  currency?: string;
  maxOffers?: number;
}

export interface FlightSearchSegment {
  origin: string;
  destination: string;
  departureDate: string;
}

export interface FlightPassengers {
  adults: number;
  children: number;
  infants: number;
}

export interface FarePolicy {
  isRefundable: boolean;
  isChangeable: boolean;
  refundPenaltyAmount?: number | null;
  refundPenaltyCurrency?: string | null;
  changePenaltyAmount?: number | null;
  changePenaltyCurrency?: string | null;
  policyVersion: 'search' | 'revalidated';
  policySource: 'duffel' | 'mystifly_v1' | 'mystifly_v2';
}

export interface FlightOffer {
  offerId: string;
  provider: string;
  price: FlightPrice;
  segments: FlightSegmentDetail[];
  totalDuration: number;
  totalStops: number;
  refundable: boolean;
  farePolicy?: FarePolicy;
  baggage?: {
    checkedBags: number;
    weightPerBag?: number;
    cabinBag?: string;
  };
  seatsRemaining?: number;
  brandedFare?: {
    brandName?: string;
    brandId?: string;
    brandTier?: number;
    fareType?: string;
  };
  validatingAirline?: string;
  lastTicketDate?: string;
  tripType?: 'one-way' | 'round-trip' | 'multi-city';
  _raw?: unknown;
  normalizedPriceUsd: number;
  bestScore: number;
  physicalFlightId: string;
  resultIndex?: string; // Original provider index/ID
  traceId?: string;     // Provider trace/session ID
  alternatives?: FlightOffer[];
}

export interface FlightPrice {
  total: number;
  base: number;
  taxes: number;
  currency: string;
  pricePerAdult: number;
}

export interface FlightSegmentDetail {
  segmentIndex: number;
  airline: {
    code: string;
    name: string;
  };
  origin: string;
  destination: string;
  flightNumber: string;
  departure: {
    airport: string;
    terminal?: string;
    time: string;
  };
  arrival: {
    airport: string;
    terminal?: string;
    time: string;
  };
  duration: number;
  stops: number;
  aircraft?: string;
  cabinClass: CabinClass;
  bookingClass?: string;
  fareBasis?: string;
}

export const AIRLINES: Record<string, string> = {
  'KE': 'Korean Air', 'OZ': 'Asiana Airlines', '7C': 'Jeju Air', 'TW': 'T\'way Air',
  'LJ': 'Jin Air', 'ZE': 'Eastar Jet', 'BX': 'Air Busan', 'RS': 'Air Seoul',
  'PR': 'Philippine Airlines', '5J': 'Cebu Pacific', 'Z2': 'AirAsia Philippines',
  'JL': 'Japan Airlines', 'NH': 'ANA', 'MM': 'Peach Aviation', 'JW': 'Vanilla Air',
  'SQ': 'Singapore Airlines', 'TR': 'Scoot', 'MH': 'Malaysia Airlines', 'AK': 'AirAsia',
  'TG': 'Thai Airways', 'FD': 'Thai AirAsia', 'VN': 'Vietnam Airlines', 'VJ': 'VietJet',
  'GA': 'Garuda Indonesia', 'QZ': 'AirAsia Indonesia', 'QR': 'Qatar Airways',
  'CX': 'Cathay Pacific', 'HX': 'Hong Kong Airlines',
  'CA': 'Air China', 'MU': 'China Eastern', 'CZ': 'China Southern', 'HU': 'Hainan Airlines',
  'CI': 'China Airlines', 'BR': 'EVA Air',
  'EK': 'Emirates', 'EY': 'Etihad Airways', 'WY': 'Oman Air',
  'SV': 'Saudia', 'GF': 'Gulf Air', 'KU': 'Kuwait Airways',
  'AI': 'Air India', '6E': 'IndiGo', 'UL': 'SriLankan Airlines',
  'QF': 'Qantas', 'JQ': 'Jetstar', 'NZ': 'Air New Zealand', 'FJ': 'Fiji Airways',
  'AA': 'American Airlines', 'DL': 'Delta Air Lines', 'UA': 'United Airlines',
  'WN': 'Southwest Airlines', 'B6': 'JetBlue', 'AS': 'Alaska Airlines',
  'NK': 'Spirit Airlines', 'F9': 'Frontier Airlines', 'HA': 'Hawaiian Airlines',
  'AC': 'Air Canada', 'WS': 'WestJet',
  'LA': 'LATAM Airlines', 'AV': 'Avianca', 'CM': 'Copa Airlines', 'AM': 'Aeromexico',
  'BA': 'British Airways', 'LH': 'Lufthansa', 'AF': 'Air France', 'KL': 'KLM',
  'IB': 'Iberia', 'AZ': 'ITA Airways', 'LX': 'SWISS', 'OS': 'Austrian Airlines',
  'SK': 'SAS', 'AY': 'Finnair', 'TP': 'TAP Portugal', 'TK': 'Turkish Airlines',
  'LO': 'LOT Polish', 'SN': 'Brussels Airlines', 'EI': 'Aer Lingus',
  'FR': 'Ryanair', 'U2': 'easyJet', 'W6': 'Wizz Air', 'VY': 'Vueling',
  'ET': 'Ethiopian Airlines', 'SA': 'South African Airways', 'KQ': 'Kenya Airways',
  'AT': 'Royal Air Maroc', 'MS': 'EgyptAir',
};

export function getAirlineName(code: string): string {
  return AIRLINES[code] || code;
}
