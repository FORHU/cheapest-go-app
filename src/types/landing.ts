// Landing page types

export interface Category {
  id: number;
  title: string;
  image: string;
}

export interface RecentSearch {
  id: number;
  destination: string;
  dates: string;
  travelers: string;
  rooms: string;
}

export interface WeekendDeal {
  id: number;
  name: string;
  location: string;
  rating: number;
  reviews: number;
  originalPrice: number;
  salePrice: number;
  image: string;
  badge: string;
}

export interface TravelStyle {
  id: number;
  title: string;
  location: string;
  price: number;
  image: string;
}

export interface VacationPackage {
  id: number;
  name: string;
  location: string;
  rating: number;
  reviews: number;
  originalPrice: number;
  salePrice: number;
  image: string;
  includes: string[];
}

export interface UniqueStay {
  id: number;
  name: string;
  location: string;
  rating: number;
  price: number;
  image: string;
  badge: string;
}
