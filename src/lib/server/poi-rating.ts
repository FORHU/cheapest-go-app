/**
 * Strip a rating /api/poi-photo used to invent, from place metadata cached before it stopped.
 *
 * When Google had no rating for a place, the route made one up — `4.0 + Math.random() * 0.9`,
 * 50–550 "reviews", vicinity "Recommended Local Spot" — and customers saw it as real. The
 * route no longer does that, but cached entries live 30 days. The invented ones are
 * unmistakable: the random rating was never rounded, and Google reports ratings to one
 * decimal place.
 */
export function withoutInventedRating<T extends Record<string, any>>(meta: T): T {
    const rating = meta?.rating;
    if (typeof rating !== 'number' || Number.isInteger(Math.round(rating * 10 * 1e6) / 1e6)) return meta;
    return {
        ...meta,
        rating: null,
        userRatingsTotal: null,
        vicinity: meta.vicinity === 'Recommended Local Spot' ? null : meta.vicinity,
        source: meta.source === 'mock-fallback' ? 'none' : meta.source,
    };
}
