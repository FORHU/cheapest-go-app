import { env } from '@/utils/env';

export async function tryGooglePlaces(name: string, lat: string, lng: string, placeId?: string) {
    const key = env.GOOGLE_PLACES_API_KEY;
    if (!key) return null;

    const fetchDetails = async (candidate: any) => {
        let photoUrl = null;
        let reviews: any[] = [];
        let details = {};

        if (candidate?.place_id) {
            try {
                const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${candidate.place_id}&fields=photos,reviews,formatted_phone_number,website,opening_hours,types&key=${key}`;
                const detailsRes = await fetch(detailsUrl, { next: { revalidate: 3600 } });
                const detailsData = await detailsRes.json();

                reviews = detailsData.result?.reviews || [];
                details = {
                    phone: detailsData.result?.formatted_phone_number,
                    website: detailsData.result?.website,
                    openingHours: detailsData.result?.opening_hours,
                    category: detailsData.result?.types?.[0]?.replace(/_/g, ' '),
                };

                const photoRef = detailsData.result?.photos?.[0]?.photo_reference;
                if (photoRef) {
                    photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${photoRef}&key=${key}`;
                }
            } catch (e) {
                console.error('[poi-google] Details fetch failed:', e);
            }
        }

        if (!photoUrl && candidate?.photos?.[0]?.photo_reference) {
            photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${candidate.photos[0].photo_reference}&key=${key}`;
        }

        return { photoUrl, reviews, ...details, place_id: candidate.place_id, name: candidate.name, vicinity: candidate.vicinity || candidate.formatted_address };
    };

    // Try candidates one at a time — return as soon as one has a photo or reviews.
    // This avoids firing 3 parallel Place Details calls and discarding 2.
    const trySequential = async (candidates: any[], ratings: any[]) => {
        for (let i = 0; i < candidates.length; i++) {
            const res = await fetchDetails(candidates[i]);
            if (res.photoUrl || res.reviews.length > 0) {
                return { rating: ratings[i]?.rating ?? null, userRatingsTotal: ratings[i]?.user_ratings_total ?? null, ...res };
            }
        }
        return null;
    };

    try {
        if (placeId) {
            const result = await fetchDetails({ place_id: placeId, name });
            if (result) return { ...result, rating: null, userRatingsTotal: null };
        }

        // Nearby search — tighter radius for better coordinate match
        const nearbyUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=500&keyword=${encodeURIComponent(name)}&key=${key}`;
        const nearbyRes = await fetch(nearbyUrl, { next: { revalidate: 3600 } });
        const nearbyData = await nearbyRes.json();

        if (nearbyData.status === 'OK') {
            const results = nearbyData.results || [];
            const found = await trySequential(results.slice(0, 3), results);
            if (found) return found;
        } else if (nearbyData.status === 'REQUEST_DENIED') {
            console.error(`[poi-google] Nearby Search DENIED for "${name}". Check Places API is enabled and billing is active.`);
        }

        console.warn(`[poi-google] No result from Nearby Search for "${name}" (status: ${nearbyData.status})`);
    } catch (err) {
        console.error('[poi-google] Error:', err);
    }
    return null;
}
