// Types for properties and stays
export interface Property {
    id: number;
    name: string;
    location: string;
    rating?: number;
    reviews?: number;
    originalPrice?: number;
    price: number;
    image: string;
    badge?: string;
    includes?: string[];
}

export interface PropertyType {
    id: string;
    title: string;
    description: string;
    image: string;
    count: number;
}

export interface RecentItem {
    id: string;
    destination: string;
    dates: string;
    type: string;
    image: string;
    price: number;
}

// Property types
export const propertyTypes: PropertyType[] = [
    { id: '1', title: 'Hotels', description: 'From budget to luxury', image: 'https://picsum.photos/seed/hotel/400/300', count: 12500 },
    { id: '2', title: 'Resorts', description: 'All-inclusive getaways', image: 'https://picsum.photos/seed/resort/400/300', count: 3200 },
    { id: '3', title: 'Villas', description: 'Private retreats', image: 'https://picsum.photos/seed/villa2/400/300', count: 1800 },
    { id: '4', title: 'Apartments', description: 'Home away from home', image: 'https://picsum.photos/seed/apartment/400/300', count: 8900 },
    { id: '5', title: 'Hostels', description: 'Budget-friendly stays', image: 'https://picsum.photos/seed/hostel/400/300', count: 2100 },
];

// Unique stays
export const uniqueStays: Property[] = [
    {
        id: 1,
        name: 'Floating Cottage',
        location: 'Batangas',
        rating: 9.4,
        price: 3500,
        image: 'https://picsum.photos/seed/floating/400/300',
        badge: 'Unique',
    },
    {
        id: 2,
        name: 'Glamping Dome',
        location: 'Tagaytay',
        rating: 9.1,
        price: 4200,
        image: 'https://picsum.photos/seed/glamping/400/300',
        badge: 'New',
    },
    {
        id: 3,
        name: 'Tree House Villa',
        location: 'Bohol',
        rating: 9.6,
        price: 5800,
        image: 'https://picsum.photos/seed/treehouse/400/300',
        badge: 'Featured',
    },
    {
        id: 4,
        name: 'Bamboo Hut',
        location: 'Siargao',
        rating: 8.9,
        price: 2890,
        image: 'https://picsum.photos/seed/bamboo/400/300',
    },
    {
        id: 5,
        name: 'Cabin by the Lake',
        location: 'Laguna',
        rating: 8.8,
        price: 2150,
        image: 'https://picsum.photos/seed/cabin/400/300',
        badge: 'Trending',
    },
];

export const uniqueTabs = ['Tents', 'Boats', 'Tree House', 'Resorts'];

// Vacation packages
export const vacationPackages: Property[] = [
    {
        id: 1,
        name: 'Boracay Beach Escape',
        location: 'Boracay',
        rating: 9.4,
        reviews: 1250,
        originalPrice: 28000,
        price: 22999,
        image: 'https://picsum.photos/seed/boracay2/400/300',
        includes: ['4★ hotel', 'Breakfast', 'Airport transfer'],
    },
    {
        id: 2,
        name: 'Palawan Paradise Tour',
        location: 'El Nido',
        rating: 9.7,
        reviews: 890,
        originalPrice: 32000,
        price: 27499,
        image: 'https://picsum.photos/seed/elnido/400/300',
        includes: ['5★ resort', 'Island hopping', 'Full board'],
    },
    {
        id: 3,
        name: 'Cebu Adventure Package',
        location: 'Cebu',
        rating: 9.0,
        reviews: 750,
        originalPrice: 18000,
        price: 14999,
        image: 'https://picsum.photos/seed/cebuadv/400/300',
        includes: ['3★ hotel', 'City tour', 'Transfers'],
    },
    {
        id: 4,
        name: 'Premium Da Nang Bay',
        location: 'Da Nang',
        rating: 9.2,
        reviews: 650,
        originalPrice: 35000,
        price: 32770,
        image: 'https://picsum.photos/seed/premium/400/300',
        includes: ['5★ hotel', 'Spa access'],
    },
];

// Recently viewed items (default mock data)
export const recentlyViewedItems: RecentItem[] = [
    {
        id: '1',
        destination: 'New York, USA',
        dates: 'Dec 15 - Dec 22',
        type: 'Flights + Hotel',
        image: 'https://picsum.photos/seed/nyc/200/150',
        price: 1249
    },
    {
        id: '2',
        destination: 'London, UK',
        dates: 'Jan 5 - Jan 12',
        type: 'Flights',
        image: 'https://picsum.photos/seed/london/200/150',
        price: 899
    },
    {
        id: '3',
        destination: 'Singapore',
        dates: 'Feb 20 - Feb 27',
        type: 'Hotel',
        image: 'https://picsum.photos/seed/singapore/200/150',
        price: 1650
    },
    {
        id: '4',
        destination: 'Sydney, Australia',
        dates: 'Mar 1 - Mar 10',
        type: 'Flights + Hotel',
        image: 'https://picsum.photos/seed/sydney/200/150',
        price: 2100
    }
];
