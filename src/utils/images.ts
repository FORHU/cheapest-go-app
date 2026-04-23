import { env } from '@/utils/env';

/**
 * Creates a Mapbox-native 'Real' visual URL for a location.
 * Uses Mapbox Static Images API to provide a geographical pinpoint of the spot.
 * Supports category-specific icons (bus, park, museum, etc.)
 */
export const getMapboxPoiImage = (name: string, lat: number, lng: number, category?: string): string => {
    const token = env.MAPBOX_TOKEN;
    const lowerName = name.toLowerCase();
    const lowerCat = (category || '').toLowerCase();
    
    // Determine the best Maki icon based on category or name keywords
    let icon = 'pin-s-star+ff0000'; // Default
    
    if (lowerCat.includes('transit') || lowerName.includes('station') || lowerName.includes('bus') || lowerName.includes('terminal') || lowerName.includes('airport')) {
        icon = 'pin-s-bus+1e293b';
    } else if (lowerCat.includes('park') || lowerCat.includes('nature') || lowerName.includes('park') || lowerName.includes('garden')) {
        icon = 'pin-s-park+059669';
    } else if (lowerCat.includes('museum') || lowerCat.includes('landmark') || lowerCat.includes('attraction')) {
        icon = 'pin-s-museum+7c3aed';
    } else if (lowerCat.includes('dining') || lowerCat.includes('food') || lowerCat.includes('restaurant') || lowerCat.includes('cafe')) {
        icon = 'pin-s-restaurant+ea580c';
    } else if (lowerCat.includes('lodging') || lowerCat.includes('hotel')) {
        icon = 'pin-s-lodging+2563eb';
    }

    if (!token) return `/api/poi-photo?name=${encodeURIComponent(name)}&lat=${lat}&lng=${lng}${category ? `&category=${encodeURIComponent(category)}` : ''}`;
    
    // Using Mapbox Static Images API for a premium geographical fallback
    return `https://api.mapbox.com/styles/v1/mapbox/streets-v11/static/${icon}(${lng},${lat})/${lng},${lat},15,0,0/600x400?access_token=${token}`;
};
