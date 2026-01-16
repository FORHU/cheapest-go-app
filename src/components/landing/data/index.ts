import type {
  RecentSearch,
  WeekendDeal,
  TravelStyle,
  VacationPackage,
  UniqueStay,
} from "@/types/landing";

// Recent searches
export const recentSearches: RecentSearch[] = [
  {
    id: 1,
    destination: "Stays in Baguio",
    dates: "Mon, Feb 9 - Fri, Feb 13",
    travelers: "2 travelers",
    rooms: "1 room",
  },
  {
    id: 2,
    destination: "Stays in Boracay",
    dates: "Sat, Mar 15 - Wed, Mar 19",
    travelers: "4 travelers",
    rooms: "2 rooms",
  },
  {
    id: 3,
    destination: "Stays in Cebu",
    dates: "Fri, Apr 4 - Sun, Apr 6",
    travelers: "2 travelers",
    rooms: "1 room",
  },
];

// Weekend deals
export const weekendDeals: WeekendDeal[] = [
  {
    id: 1,
    name: "Waterfront Suites",
    location: "Makati City",
    rating: 9.2,
    reviews: 1234,
    originalPrice: 3200,
    salePrice: 2274,
    image: "https://picsum.photos/seed/waterfront/400/300",
    badge: "Exceptional",
  },
  {
    id: 2,
    name: "Ramada by Wyndham Manila Central",
    location: "Binondo",
    rating: 8.4,
    reviews: 856,
    originalPrice: 5000,
    salePrice: 4400,
    image: "https://picsum.photos/seed/ramada/400/300",
    badge: "Very good",
  },
  {
    id: 3,
    name: "Savoy Hotel Mactan Newtown",
    location: "Cebu",
    rating: 8.8,
    reviews: 2100,
    originalPrice: 6200,
    salePrice: 5049,
    image: "https://picsum.photos/seed/savoy/400/300",
    badge: "Excellent",
  },
  {
    id: 4,
    name: "The Alpha Suites",
    location: "BGC Taguig",
    rating: 9.0,
    reviews: 1540,
    originalPrice: 7500,
    salePrice: 5872,
    image: "https://picsum.photos/seed/alpha/400/300",
    badge: "Exceptional",
  },
];

// Travel styles
export const travelStyles: TravelStyle[] = [
  {
    id: 1,
    title: "Beach",
    location: "Palawan, Philippines",
    price: 3749,
    image: "https://picsum.photos/seed/beach2/400/300",
  },
  {
    id: 2,
    title: "Kid-friendly",
    location: "Tagaytay, Philippines",
    price: 11681,
    image: "https://picsum.photos/seed/kids/400/300",
  },
  {
    id: 3,
    title: "Staycation",
    location: "Manila, Philippines",
    price: 18261,
    image: "https://picsum.photos/seed/staycation/400/300",
  },
  {
    id: 4,
    title: "Lux Hotels",
    location: "Cebu, Philippines",
    price: 51709,
    image: "https://picsum.photos/seed/luxury/400/300",
  },
];

export const styleTabs = [
  "Beach",
  "Kid-Friendly",
  "Ski",
  "Romantic",
  "Wellness and Relaxation",
];

// Vacation packages
export const packages: VacationPackage[] = [
  {
    id: 1,
    name: "The Blossom Resort Vo Coi Da Nang",
    location: "Da Nang",
    rating: 9.4,
    reviews: 780,
    originalPrice: 25344,
    salePrice: 21369,
    image: "https://picsum.photos/seed/blossom/400/300",
    includes: ["4★ hotel", "Free cancellation"],
  },
  {
    id: 2,
    name: "Golden Lotus Beach Resort",
    location: "Phu Quoc",
    rating: 8.8,
    reviews: 1250,
    originalPrice: 31469,
    salePrice: 28700,
    image: "https://picsum.photos/seed/golden/400/300",
    includes: ["5★ hotel", "Breakfast included"],
  },
  {
    id: 3,
    name: "Mia Mia's Beach Danang",
    location: "Da Nang",
    rating: 9.0,
    reviews: 920,
    originalPrice: 22200,
    salePrice: 20700,
    image: "https://picsum.photos/seed/miamia/400/300",
    includes: ["4★ hotel", "Airport transfer"],
  },
  {
    id: 4,
    name: "Premium Da Nang Bay",
    location: "Da Nang",
    rating: 9.2,
    reviews: 650,
    originalPrice: 35000,
    salePrice: 32770,
    image: "https://picsum.photos/seed/premium/400/300",
    includes: ["5★ hotel", "Spa access"],
  },
];

export const packageTabs = [
  "All Places",
  "Ho Chi Minh City",
  "Bali",
  "Seoul",
  "Bangkok",
];

// Unique stays
export const uniqueStays: UniqueStay[] = [
  {
    id: 1,
    name: "Aircabin + Floats",
    location: "Calatagan",
    rating: 9.4,
    price: 1825,
    image: "https://picsum.photos/seed/aircabin/400/300",
    badge: "Exceptional",
  },
  {
    id: 2,
    name: "Sunrise Bay Treehouse Cabins",
    location: "Batangas",
    rating: 8.6,
    price: 1411,
    image: "https://picsum.photos/seed/treehouse/400/300",
    badge: "Excellent",
  },
  {
    id: 3,
    name: "Creekside Bed-rooms",
    location: "Tanay, Rizal",
    rating: 9.0,
    price: 1623,
    image: "https://picsum.photos/seed/creekside/400/300",
    badge: "Very Good",
  },
  {
    id: 4,
    name: "Ocean Villa",
    location: "Zambales",
    rating: 9.2,
    price: 1839,
    image: "https://picsum.photos/seed/oceanvilla/400/300",
    badge: "Popular",
  },
  {
    id: 5,
    name: "Cabin by the Lake",
    location: "Laguna",
    rating: 8.8,
    price: 2150,
    image: "https://picsum.photos/seed/cabin/400/300",
    badge: "Trending",
  },
];

export const uniqueTabs = ["Tents", "Boats", "Tree House", "Resorts"];
