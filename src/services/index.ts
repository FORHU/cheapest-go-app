// Service exports for clean imports
export { liteApiService } from './liteapi.service';
export type { SearchParams, HotelDetailsParams, LiteApiFacility } from './liteapi.service';

export type {
  PrebookParams,
  BookingParams,
  Guest,
  PrebookResponse,
  BookingResponse,
  CancellationPolicy,
  AmendBookingParams,
  AmendBookingResponse,
} from './booking.service';
