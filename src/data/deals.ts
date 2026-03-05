// Types for deals and offers
export interface Deal {
    id: string;
    title: string;
    subtitle: string;
    discount: string;
    originalPrice: number;
    salePrice: number;
    image: string;
    endsIn: string;
    tag?: string;
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
    badge?: string;
}

// Flash deals data
export const flashDeals: Deal[] = [
    {
        id: '1',
        title: 'Tokyo Adventure',
        subtitle: 'Round trip + 5 nights',
        discount: '35% OFF',
        originalPrice: 2499,
        salePrice: 1624,
        image: 'https://picsum.photos/seed/tokyo-tower/400/300',
        endsIn: '2d 14h',
        tag: 'Flash Sale'
    },
    {
        id: '2',
        title: 'Paris Getaway',
        subtitle: 'Round trip + 4 nights',
        discount: '25% OFF',
        originalPrice: 1899,
        salePrice: 1424,
        image: 'https://picsum.photos/seed/eiffel-tower/400/300',
        endsIn: '1d 8h'
    },
    {
        id: '3',
        title: 'Bali Paradise',
        subtitle: 'Round trip + 7 nights',
        discount: '40% OFF',
        originalPrice: 2199,
        salePrice: 1319,
        image: 'https://picsum.photos/seed/bali-temple/400/300',
        endsIn: '3d 2h',
        tag: 'Best Value'
    },
    {
        id: '4',
        title: 'Swiss Alps Escape',
        subtitle: 'Round trip + 5 nights',
        discount: '30% OFF',
        originalPrice: 3299,
        salePrice: 2309,
        image: 'https://picsum.photos/seed/matterhorn/400/300',
        endsIn: '4d 6h'
    },
    {
        id: '5',
        title: 'Dubai Luxury',
        subtitle: 'Round trip + 4 nights',
        discount: '20% OFF',
        originalPrice: 2799,
        salePrice: 2239,
        image: 'https://picsum.photos/seed/burj-khalifa/400/300',
        endsIn: '5d 12h',
        tag: 'Premium'
    }
];

// Weekend deals data
export const weekendDeals: WeekendDeal[] = [
    {
        id: 1,
        name: 'Seda Ayala Center Cebu',
        location: 'Cebu City',
        rating: 9.2,
        reviews: 2341,
        originalPrice: 8500,
        salePrice: 5990,
        image: 'https://picsum.photos/seed/cebu-monument/400/300',
        badge: 'Exceptional',
    },
    {
        id: 2,
        name: 'Oakwood Premier Joy~Nostalg',
        location: 'Pasig City',
        rating: 8.8,
        reviews: 1892,
        originalPrice: 6200,
        salePrice: 4340,
        image: 'https://picsum.photos/seed/manila-skyline/400/300',
    },
    {
        id: 3,
        name: 'Shangri-La Boracay Resort',
        location: 'Boracay Island',
        rating: 9.6,
        reviews: 3156,
        originalPrice: 14999,
        salePrice: 11250,
        image: 'https://picsum.photos/seed/boracay-sunset/400/300',
        badge: 'VIP Access',
    },
    {
        id: 4,
        name: 'The Alpha Suites',
        location: 'BGC Taguig',
        rating: 9.0,
        reviews: 1540,
        originalPrice: 7500,
        salePrice: 5872,
        image: 'https://picsum.photos/seed/bgc-cityscape/400/300',
        badge: 'Exceptional',
    },
];

// Recent searches
export interface RecentSearch {
    id: number;
    destination: string;
    dates: string;
    travelers: string;
    rooms: string;
}

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

// Vacation packages
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

export const packages: VacationPackage[] = [
    {
        id: 1,
        name: "The Blossom Resort Vo Coi Da Nang",
        location: "Da Nang",
        rating: 9.4,
        reviews: 780,
        originalPrice: 25344,
        salePrice: 21369,
        image: 'https://picsum.photos/seed/danang-bridge/400/300',
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
        image: 'https://picsum.photos/seed/phuquoc-island/400/300',
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
        image: 'https://picsum.photos/seed/danang-beach/400/300',
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
        image: 'https://picsum.photos/seed/danang-bay/400/300',
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
