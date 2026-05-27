import type { ContentEntry } from './types.ts';
import type { ETGHotel } from './etg-search.ts';

export function transformETGHotel(hotel: ETGHotel, cityName: string) {
  return {
    hotelId: hotel.id,
    name: hotel.name,
    location: cityName,
    address: hotel.address,
    description: hotel.description,
    rating: 0,
    reviews: 0,
    price: hotel.price,
    currency: hotel.currency,
    image: hotel.images[0] || '',
    images: hotel.images,
    amenities: [],
    badges: [],
    type: 'hotel',
    coordinates: { lat: hotel.lat, lng: hotel.lng },
    refundableTag: hotel.isRefundable ? 'RFN' : 'NRFN',
    cancelPenalties: [],
    boardTypes: hotel.meal ? [hotel.meal] : [],
    starRating: hotel.starRating,
    latitude: hotel.lat,
    longitude: hotel.lng,
    _etg: { hid: hotel.id, matchHash: hotel.matchHash },
  };
}

export function transformOptionToHotel(
  option: any,
  cityName: string,
  currency: string,
  content?: ContentEntry
) {
  const price        = option.price?.gross || option.price?.net || 0;
  const isRefundable = option.cancelPolicy?.refundable === true;
  const name         = content?.name || option.hotelName || `Hotel ${option.hotelCode}`;
  const lat          = content?.lat || 0;
  const lng          = content?.lng || 0;
  const images       = content?.images || [];
  const image        = images[0] || '';

  const cancelPenalties = option.cancelPolicy?.cancelPenalties || [];

  // Prefer ETG review_rating (0-10 scale), fall back to star-based estimate
  const rawRating  = content?.reviewRating ?? content?.rating ?? 0;
  const starRating = content?.starRating || 0;
  const rating     = rawRating > 0 ? rawRating : (starRating > 0 ? starRating * 1.8 : 0);
  const reviews    = content?.reviewCount ?? content?.reviews ?? 0;

  return {
    hotelId: option.hotelCode,
    name,
    location: content?.city || cityName,
    address: content?.address || '',
    description: content?.description || '',
    rating,
    reviews,
    price,
    currency: option.price?.currency || currency,
    image,
    images,
    amenities: content?.amenities || [],
    badges: [],
    type: 'hotel',
    coordinates: { lat, lng },
    refundableTag: isRefundable ? 'RFN' : 'NRFN',
    cancelPenalties,
    boardTypes: option.boardCode ? [option.boardCode] : [],
    starRating,
    latitude: lat,
    longitude: lng,
    _tgx: {
      optionId: option.id,
      token: option.token,
      accessCode: option.accessCode,
      supplierCode: option.supplierCode,
      boardCode: option.boardCode,
      rateRules: option.rateRules,
    },
  };
}
