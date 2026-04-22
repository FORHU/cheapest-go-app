import { 
    Search, 
    Utensils, 
    Landmark, 
    ShoppingBasket, 
    Pill, 
    Bus, 
    Trees, 
    Bed, 
    Coffee, 
    GraduationCap, 
    Building2, 
    Banknote, 
    Church, 
    Library 
} from 'lucide-react';

/**
 * Constants and configuration for map discovery and POI filtering.
 */

export const GOOGLE_MAPS_SEARCH_URL = 'https://www.google.com/maps/search/?api=1';

export const POI_FILTERS = [
    { id: 'all', label: 'All Discovery', icon: Search },
    { id: 'restaurant', label: 'Dining', icon: Utensils },
    { id: 'attraction', label: 'Attractions & Parks', icon: Landmark },
    { id: 'grocery', label: 'Groceries', icon: ShoppingBasket },
    { id: 'medical', label: 'Hospitals & Health', icon: Pill },
    { id: 'transit', label: 'Transit', icon: Bus },
];

export const NEARBY_CATEGORIES = [
    { id: 'restaurant', label: 'Food', icon: Utensils, color: 'text-orange-500', bg: 'bg-orange-50' },
    { id: 'park', label: 'Parks', icon: Trees, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { id: 'shopping', label: 'Shopping', icon: ShoppingBasket, color: 'text-blue-500', bg: 'bg-blue-50' },
    { id: 'attractions', label: 'Sightseeing', icon: Landmark, color: 'text-purple-500', bg: 'bg-purple-50' },
    { id: 'transit', label: 'Transit', icon: Bus, color: 'text-slate-500', bg: 'bg-slate-50' },
];

export const MAP_FILTER_CONFIG = [
    { id: 'dining', label: 'Eat', icon: Utensils, keywords: ['restaurant', 'cafe', 'food', 'bar', 'dining'] },
    { id: 'lodging', label: 'Stay', icon: Bed, keywords: ['hotel', 'motel', 'lodging', 'accommodation', 'resort'] },
    { id: 'nature', label: 'Explore', icon: Trees, keywords: ['park', 'garden', 'nature', 'viewpoint', 'forest', 'trail'] },
    { id: 'explore', label: 'Attractions', icon: Landmark, keywords: ['attraction', 'museum', 'monument', 'landmark', 'sightseeing', 'tourism', 'zoo', 'aquarium', 'gallery'] },
    { id: 'grocery', label: 'Grocery', icon: ShoppingBasket, keywords: ['grocery', 'supermarket', 'convenience', 'shop', 'market', 'mall'] },
    { id: 'medical', label: 'Health', icon: Pill, keywords: ['hospital', 'clinic', 'medical', 'pharmacy', 'doctor', 'dentist'] },
    { id: 'transit', label: 'Transit', icon: Bus, keywords: ['bus', 'train', 'station', 'transit', 'subway', 'metro', 'airport'] },
];

export const BAGUIO_DEFAULT_GEMS = [
    { 
        type: 'Feature' as const, 
        geometry: { type: 'Point' as const, coordinates: [120.5946, 16.4124] },
        properties: { name: 'Burnham Park', category: 'Park', icon: Trees, rating: 4.5 }
    },
    { 
        type: 'Feature' as const, 
        geometry: { type: 'Point' as const, coordinates: [120.6274, 16.4231] },
        properties: { name: 'Mines View Park', category: 'Sightseeing', icon: Landmark, rating: 4.4 }
    },
    { 
        type: 'Feature' as const, 
        geometry: { type: 'Point' as const, coordinates: [120.5971, 16.4138] },
        properties: { name: 'Session Road', category: 'Shopping', icon: ShoppingBasket, rating: 4.6 }
    },
    { 
        type: 'Feature' as const, 
        geometry: { type: 'Point' as const, coordinates: [120.5937, 16.4162] },
        properties: { name: 'Good Taste Cafe', category: 'Dining', icon: Utensils, rating: 4.7 }
    },
    { 
        type: 'Feature' as const, 
        geometry: { type: 'Point' as const, coordinates: [120.5847, 16.3986] },
        properties: { name: 'Chaya Baguio', category: 'Dining', icon: Utensils, rating: 4.8 }
    },
    { 
        type: 'Feature' as const, 
        geometry: { type: 'Point' as const, coordinates: [120.5975, 16.4135] },
        properties: { name: 'Vizco\'s Restaurant', category: 'Dining', icon: Utensils, rating: 4.5 }
    },
];

export const POI_ICON_MAP: Record<string, any> = {
    restaurant: Utensils, 
    cafe: Coffee, 
    food: Utensils, 
    bar: Utensils,
    park: Trees, 
    garden: Trees, 
    park_like: Trees,
    school: GraduationCap, 
    university: Building2, 
    college: GraduationCap,
    pharmacy: Pill, 
    medical: Pill, 
    hospital: Pill,
    bank: Banknote, 
    atm: Banknote,
    shop: ShoppingBasket, 
    mall: ShoppingBasket, 
    supermarket: ShoppingBasket,
    church: Church, 
    religion: Church, 
    place_of_worship: Church,
    museum: Library, 
    landmark: Landmark, 
    monument: Landmark, 
    attraction: Landmark,
    bus: Bus, 
    rail: Bus, 
    station: Bus,
};
