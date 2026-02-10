// Types for properties and stays
// Using SimpleProperty to avoid conflict with the more detailed Property in mockProperties.ts
export interface SimpleProperty {
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

export interface RecentItem {
    id: string;
    destination: string;
    dates: string;
    type: string;
    image: string;
    price: number;
}

// Unique stays
export const uniqueStays: SimpleProperty[] = [
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
