// Types for landing page sections

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
    id: string | number;
    name: string;
    location: string;
    rating: number;
    reviews: number;
    originalPrice: number;
    salePrice: number;
    image: string;
    badge?: string;
}

export interface RecentSearch {
    id: string | number;
    destination: string;
    dates: string;
    travelers: string;
    rooms: string;
}

export interface VacationPackage {
    id: string | number;
    name: string;
    location: string;
    rating: number;
    reviews: number;
    originalPrice: number;
    salePrice: number;
    image: string;
    includes: string[];
}

export const packageTabs = [
    "All Places",
    "Ho Chi Minh City",
    "Bali",
    "Seoul",
    "Bangkok",
];

export const styleTabs = ['Beach', 'Kid-Friendly', 'Ski', 'Romantic', 'Wellness and Relaxation'];
