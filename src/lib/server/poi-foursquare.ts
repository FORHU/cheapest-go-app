import { env } from '@/utils/env';

export async function tryFoursquare(name: string, lat: string, lng: string, fsqId?: string) {
    const key = env.FOURSQUARE_API_KEY;
    if (!key) return null;

    const trySearch = async (query: string, radius = 2000) => {
        const url = `https://api.foursquare.com/v3/places/search?query=${encodeURIComponent(query)}&ll=${lat},${lng}&radius=${radius}&limit=1&fields=fsq_id,name,photos,tips,rating,stats,location,hours`;
        const res = await fetch(url, {
            headers: { Authorization: key, Accept: 'application/json' },
            next: { revalidate: 3600 },
        });
        if (!res.ok) return null;
        return (await res.json()).results?.[0];
    };

    try {
        let place = null;

        if (fsqId) {
            const url = `https://api.foursquare.com/v3/places/${fsqId}?fields=fsq_id,name,photos,tips,rating,stats,location,hours`;
            const res = await fetch(url, {
                headers: { Authorization: key, Accept: 'application/json' },
                next: { revalidate: 3600 },
            });
            if (res.ok) place = await res.json();
        }

        if (!place) place = await trySearch(name);

        if (!place) {
            const normalized = name.replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim();
            if (normalized !== name) place = await trySearch(normalized);
        }

        if (!place) place = await trySearch('', 100);
        if (!place) return null;

        let photoUrl: string | null = null;
        if (place.photos?.[0]) {
            photoUrl = `${place.photos[0].prefix}600x400${place.photos[0].suffix}`;
        }

        let tips = (place.tips || []).map((tip: any) => ({
            author_name: 'Foursquare User',
            text: tip.text,
            relative_time_description: tip.created_at ? new Date(tip.created_at).toLocaleDateString() : 'Recommendation',
            rating: 5,
        }));

        if (place.fsq_id) {
            try {
                const tipsUrl = `https://api.foursquare.com/v3/places/${place.fsq_id}/tips?limit=10&sort=POPULAR`;
                const tipsRes = await fetch(tipsUrl, {
                    headers: { Authorization: key, Accept: 'application/json' },
                    next: { revalidate: 3600 },
                });
                if (tipsRes.ok) {
                    const moreTips = (await tipsRes.json() || []).map((tip: any) => ({
                        author_name: 'Foursquare User',
                        text: tip.text,
                        relative_time_description: tip.created_at ? new Date(tip.created_at).toLocaleDateString() : 'Popular Tip',
                        rating: 5,
                    }));
                    tips = [...tips, ...moreTips].slice(0, 10);
                }
            } catch (e) {
                console.error('[poi-foursquare] Tips fetch failed:', e);
            }
        }

        return {
            photoUrl,
            tips,
            fsqId: place.fsq_id,
            rating: place.rating ? place.rating / 2 : null,
            userRatingsTotal: place.stats?.total_ratings || 0,
            category: place.categories?.[0]?.name || null,
            openingHours: place.hours ? {
                open_now: place.hours.is_open_now,
                weekday_text: place.hours.display ? [place.hours.display] : [],
            } : null,
            vicinity: place.location?.formatted_address || place.location?.address || null,
        };
    } catch (err) {
        console.error('[poi-foursquare] Error:', err);
        return null;
    }
}
