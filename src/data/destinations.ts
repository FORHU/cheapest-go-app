// Types for destinations
export interface Destination {
    id: string;
    title: string;
    subtitle?: string;
    image: string;
    properties?: number;
}

export interface FavoriteStay {
    id: number;
    title: string;
    image: string;
}

// Popular destinations
export const popularDestinations: Destination[] = [
    { id: '1', title: 'Manila', subtitle: 'National Capital Region', image: 'https://picsum.photos/seed/manila/400/300', properties: 2340 },
    { id: '2', title: 'Cebu', subtitle: 'Central Visayas', image: 'https://picsum.photos/seed/cebu/400/300', properties: 1820 },
    { id: '3', title: 'Boracay', subtitle: 'Western Visayas', image: 'https://picsum.photos/seed/boracay/400/300', properties: 890 },
    { id: '4', title: 'Baguio', subtitle: 'Summer Capital', image: 'https://picsum.photos/seed/baguio/400/300', properties: 650 },
    { id: '5', title: 'Palawan', subtitle: 'Mimaropa', image: 'https://picsum.photos/seed/palawan/400/300', properties: 720 },
    { id: '6', title: 'Davao', subtitle: 'Davao Region', image: 'https://picsum.photos/seed/davao/400/300', properties: 540 },
];

// Favorite stays categories
export const favoriteStays: FavoriteStay[] = [
    { id: 1, title: 'Pet-friendly', image: 'https://picsum.photos/seed/pet/300/200' },
    { id: 2, title: 'Pool', image: 'https://picsum.photos/seed/pool/300/200' },
    { id: 3, title: 'Beachfront', image: 'https://picsum.photos/seed/beach/300/200' },
    { id: 4, title: 'Spa', image: 'https://picsum.photos/seed/spa/300/200' },
    { id: 5, title: 'Romantic', image: 'https://picsum.photos/seed/romantic/300/200' },
];

// Travel styles
export const travelStyles = [
    { id: 1, title: 'Beachfront Villa', location: 'Boracay, Philippines', price: 25899, image: 'https://picsum.photos/seed/villa/400/300' },
    { id: 2, title: 'Mountain Retreat', location: 'Batanes, Philippines', price: 18499, image: 'https://picsum.photos/seed/mountain/400/300' },
    { id: 3, title: 'City View Suite', location: 'Makati, Philippines', price: 32450, image: 'https://picsum.photos/seed/city/400/300' },
    { id: 4, title: 'Lux Hotels', location: 'Cebu, Philippines', price: 51709, image: 'https://picsum.photos/seed/luxury/400/300' },
];

export const styleTabs = ['Beach', 'Kid-Friendly', 'Ski', 'Romantic', 'Wellness and Relaxation'];
