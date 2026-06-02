/**
 * Last-resort placeholder when Google Places returns no photo.
 *
 * Previously this returned a Mapbox Static map tile, which was visually confusing
 * (a zoomed-in street map is not a photo of the place). Now returns a styled
 * placehold.co image with a category-appropriate colour and the place name.
 *
 * No map tiles are used here — those are reserved for actual map components.
 */
export function getPlaceholderUrl(
    name: string,
    category?: string,
    _lat?: string,  // kept for signature compatibility — no longer used
    _lng?: string,
): string {
    const lowerCat  = (category || '').toLowerCase();
    const lowerName = name.toLowerCase();

    // Category-keyed background colours (dark, readable)
    let bgHex = '1e293b'; // default slate-800
    if (
        lowerCat.includes('transit') || lowerCat.includes('station') ||
        lowerName.includes('station') || lowerName.includes('bus') ||
        lowerName.includes('terminal') || lowerName.includes('airport')
    ) {
        bgHex = '334155'; // slate-700
    } else if (
        lowerCat.includes('park') || lowerCat.includes('nature') ||
        lowerName.includes('park') || lowerName.includes('garden')
    ) {
        bgHex = '064e3b'; // emerald-900
    } else if (
        lowerCat.includes('restaurant') || lowerCat.includes('cafe') ||
        lowerCat.includes('dining') || lowerCat.includes('food')
    ) {
        bgHex = '7c2d12'; // orange-900
    } else if (
        lowerCat.includes('museum') || lowerCat.includes('landmark') ||
        lowerCat.includes('attraction') || lowerCat.includes('tourism')
    ) {
        bgHex = '3730a3'; // indigo-800
    } else if (lowerCat.includes('shop') || lowerCat.includes('market') || lowerCat.includes('mall')) {
        bgHex = '831843'; // pink-900
    } else if (lowerCat.includes('medical') || lowerCat.includes('hospital') || lowerCat.includes('pharmacy')) {
        bgHex = '1e3a5f'; // blue-950
    } else if (lowerCat.includes('lodging') || lowerCat.includes('hotel')) {
        bgHex = '1e3a5f'; // blue-950
    }

    // Truncate to keep the URL tidy; placehold.co handles URL-encoded text
    const label = name.length > 28 ? `${name.slice(0, 26)}…` : name;
    // Category-keyed background colours (dark, readable)
    let bgHex = '1e293b'; // default slate-800
    if (
        lowerCat.includes('transit') || lowerCat.includes('station') ||
        lowerName.includes('station') || lowerName.includes('bus') ||
        lowerName.includes('terminal') || lowerName.includes('airport')
    ) {
        bgHex = '334155'; // slate-700
    } else if (
        lowerCat.includes('park') || lowerCat.includes('nature') ||
        lowerName.includes('park') || lowerName.includes('garden')
    ) {
        bgHex = '064e3b'; // emerald-900
    } else if (
        lowerCat.includes('restaurant') || lowerCat.includes('cafe') ||
        lowerCat.includes('dining') || lowerCat.includes('food')
    ) {
        bgHex = '7c2d12'; // orange-900
    } else if (
        lowerCat.includes('museum') || lowerCat.includes('landmark') ||
        lowerCat.includes('attraction') || lowerCat.includes('tourism')
    ) {
        bgHex = '3730a3'; // indigo-800
    } else if (lowerCat.includes('shop') || lowerCat.includes('market') || lowerCat.includes('mall')) {
        bgHex = '831843'; // pink-900
    } else if (lowerCat.includes('medical') || lowerCat.includes('hospital') || lowerCat.includes('pharmacy')) {
        bgHex = '1e3a5f'; // blue-950
    } else if (lowerCat.includes('lodging') || lowerCat.includes('hotel')) {
        bgHex = '1e3a5f'; // blue-950
    }

    // Truncate to keep the URL tidy; placehold.co handles URL-encoded text
    const label = name.length > 28 ? `${name.slice(0, 26)}…` : name;

    return `https://placehold.co/600x400/${bgHex}/ffffff?text=${encodeURIComponent(label)}&font=montserrat`;
    return `https://placehold.co/600x400/${bgHex}/ffffff?text=${encodeURIComponent(label)}&font=montserrat`;
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
