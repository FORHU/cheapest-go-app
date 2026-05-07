import { env } from '@/utils/env';

export async function tryGooglePlaces(name: string, lat: string, lng: string, placeId?: string) {
    const key = env.GOOGLE_PLACES_API_KEY;
    if (!key) return null;

    const findPhotoInCandidate = async (candidate: any) => {
        let photoUrl = null;
        let reviews = [];
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

        return { photoUrl, reviews, ...details, name: candidate.name, vicinity: candidate.vicinity || candidate.formatted_address };
    };

    try {
        if (placeId) {
            const result = await findPhotoInCandidate({ place_id: placeId, name });
            if (result) return { ...result, rating: null, userRatingsTotal: null };
        }

        // Nearby search — tighter radius for better coordinate match
        const nearbyUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=500&keyword=${encodeURIComponent(name)}&key=${key}`;
        const nearbyRes = await fetch(nearbyUrl, { next: { revalidate: 3600 } });
        const nearbyData = await nearbyRes.json();

        if (nearbyData.status === 'OK') {
            const results = nearbyData.results || [];
            const candidateResults = await Promise.all(results.slice(0, 3).map((c: any) => findPhotoInCandidate(c)));
            for (let i = 0; i < candidateResults.length; i++) {
                const res = candidateResults[i];
                if (res.photoUrl || res.reviews.length > 0) {
                    return { rating: results[i].rating, userRatingsTotal: results[i].user_ratings_total, ...res };
                }
            }
        } else if (nearbyData.status === 'REQUEST_DENIED') {
            console.error(`[poi-google] Nearby Search DENIED for "${name}". Check Places API is enabled and billing is active.`);
        }

        // Text search — broader fallback
        const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(name)}&location=${lat},${lng}&radius=3000&key=${key}`;
        const searchRes = await fetch(searchUrl, { next: { revalidate: 3600 } });
        const searchData = await searchRes.json();

        if (searchData.status === 'OK') {
            const results = searchData.results || [];
            const candidateResults = await Promise.all(results.slice(0, 3).map((c: any) => findPhotoInCandidate(c)));
            for (let i = 0; i < candidateResults.length; i++) {
                const res = candidateResults[i];
                if (res.photoUrl || res.reviews.length > 0) {
                    return { rating: results[i].rating, userRatingsTotal: results[i].user_ratings_total, ...res };
                }
            }

            const best = results[0];
            return {
                photoUrl: null,
                rating: best.rating,
                userRatingsTotal: best.user_ratings_total,
                vicinity: best.formatted_address || best.vicinity,
                reviews: [],
            };
        } else if (searchData.status === 'REQUEST_DENIED') {
            console.error(`[poi-google] Text Search DENIED for "${name}". Check API Key restrictions in Google Cloud Console.`);
        }

        console.warn(`[poi-google] No photo found for "${name}" (Status: ${searchData.status}/${nearbyData.status})`);
    } catch (err) {
        console.error('[poi-google] Error:', err);
    }
    return null;
}
