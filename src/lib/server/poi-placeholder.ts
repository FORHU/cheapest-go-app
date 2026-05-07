import { env } from '@/utils/env';

export function getPlaceholderUrl(name: string, category?: string, lat?: string, lng?: string): string {
    const lowerCat = (category || '').toLowerCase();
    const lowerName = name.toLowerCase();

    if (lat && lng && env.MAPBOX_TOKEN) {
        let icon = 'pin-s-star+ff0000';
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
        return `https://api.mapbox.com/styles/v1/mapbox/streets-v11/static/${icon}(${lng},${lat})/${lng},${lat},15,0,0/600x400?access_token=${env.MAPBOX_TOKEN}`;
    }

    let bgColor = '1e293b';
    if (lowerCat.includes('transit')) bgColor = '475569';
    else if (lowerCat.includes('park') || lowerCat.includes('nature')) bgColor = '065f46';
    else if (lowerCat.includes('dining')) bgColor = '9a3412';
    else if (lowerCat.includes('attraction')) bgColor = '5b21b6';

    return `https://placehold.co/600x400/${bgColor}/ffffff?text=${encodeURIComponent(name)}`;
}

export async function isValidImageResponse(url: string): Promise<boolean> {
    try {
        const res = await fetch(url, { next: { revalidate: 3600 } });
        if (!res.ok) return false;
        return (res.headers.get('content-type') || '').toLowerCase().startsWith('image/');
    } catch {
        return false;
    }
}
