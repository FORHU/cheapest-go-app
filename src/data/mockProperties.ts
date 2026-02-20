export interface Property {
    id: string;
    name: string;
    location: string;
    description: string;
    rating: number;
    reviews: number;
    price: number;
    originalPrice?: number;
    image: string;
    images: string[];
    amenities: string[];
    badges: string[];
    type: 'hotel' | 'apartment' | 'resort' | 'villa';
    coordinates: {
        lat: number;
        lng: number;
    };
    /** Cancellation policy tag from LiteAPI: "RFN" = refundable, "NRFN" = non-refundable */
    refundableTag?: 'RFN' | 'NRFN' | string;
    /** Distance from city centre in meters or km */
    distance?: string;
    /** Board/meal plan types from LiteAPI: "Breakfast included", "Room only", etc. */
    boardTypes?: string[];
}

export const baguioProperties: Property[] = [
    {
        id: 'baguio-1',
        name: 'The Manor at Camp John Hay',
        location: 'Camp John Hay, Baguio',
        description: 'Experience the old world charm and elegance of The Manor. Nestled within the pine trees of Camp John Hay.',
        rating: 9.2,
        reviews: 3420,
        price: 8500,
        originalPrice: 10500,
        image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&q=80&w=800', // Resort-style
        images: [
            'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&q=80&w=800',
            'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&q=80&w=800'
        ],
        amenities: ['Free WiFi', 'Spa', 'Garden', 'Restaurant', 'Fitness Center'],
        badges: ['Exceptional', 'Luxury'],
        type: 'hotel',
        coordinates: { lat: 16.400591, lng: 120.617627 }
    },
    {
        id: 'baguio-2',
        name: 'Grand Sierra Pines Baguio',
        location: 'Outlook Drive, Baguio',
        description: 'A place where you can relax, unwind and enjoy the cool breeze of Baguio City.',
        rating: 8.8,
        reviews: 1250,
        price: 5200,
        originalPrice: 6500,
        image: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&q=80&w=800', // Modern hotel
        images: [
            'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&q=80&w=800'
        ],
        amenities: ['Free WiFi', 'Breakfast included', 'Parking', 'Balcony'],
        badges: ['Very Good'],
        type: 'hotel',
        coordinates: { lat: 16.4160, lng: 120.6262 }
    },
    {
        id: 'baguio-3',
        name: 'Baguio Country Club',
        location: 'Country Club Road, Baguio',
        description: 'Historical premier exclusive club in the Philippines.',
        rating: 9.0,
        reviews: 2100,
        price: 7800,
        image: 'https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&q=80&w=800', // Cozy interior
        images: [],
        amenities: ['Golf Course', 'Heated Pool', 'Gym', 'Multiple Restaurants'],
        badges: ['Historic', 'Excellent'],
        type: 'resort',
        coordinates: { lat: 16.4083, lng: 120.6173 }
    },
    {
        id: 'baguio-4',
        name: 'Azalea Hotels & Residences Baguio',
        location: 'Leonard Wood Loop, Baguio',
        description: 'The first and only 4-star serviced apartment hotel in Baguio City.',
        rating: 8.5,
        reviews: 980,
        price: 4500,
        originalPrice: 5800,
        image: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&q=80&w=800', // Apartment style
        images: [],
        amenities: ['Kitchenette', 'Free WiFi', 'Family Rooms', 'Concierge'],
        badges: ['Family Friendly'],
        type: 'apartment',
        coordinates: { lat: 16.4112, lng: 120.6015 }
    },
    {
        id: 'baguio-5',
        name: 'Kamiseta Hotel',
        location: 'Outlook Drive, Baguio',
        description: 'Boutique hotel with whimsical interiors and personalized service.',
        rating: 9.4,
        reviews: 560,
        price: 6200,
        image: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&q=80&w=800', // Boutique
        images: [],
        amenities: ['Boutique', 'Cafe', 'Instagrammable', 'Garden'],
        badges: ['Trending', 'Exceptional'],
        type: 'hotel',
        coordinates: { lat: 16.4128, lng: 120.6245 }
    }
];
