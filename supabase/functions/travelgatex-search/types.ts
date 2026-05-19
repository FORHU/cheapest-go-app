export type ContentEntry = {
  name: string;
  lat: number;
  lng: number;
  images: string[];
  starRating: number;
  address?: string;
  city?: string;
  country?: string;
  description?: string;
  amenities?: string[];
  amenityGroups?: Array<{ group: string; amenities: string[] }>;
  roomGroups?: Array<{ name: string; images: string[] }>;
  checkInTime?: string;
  checkOutTime?: string;
  reviewRating?: number;
  reviewCount?: number;
  importantInformation?: string;
  rating?: number;
  reviews?: number;
};

export type DestSearchResult = { destCodes: string[]; hotelCodes: string[] };
