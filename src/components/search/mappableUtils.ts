/**
 * Pure helpers shared by the hotel results list and the map pins, kept in their
 * own module (no React / mapbox imports) so they can be unit-tested in isolation.
 *
 * The list and the map derive from the same set produced by these helpers, which
 * is what keeps the marker count identical to the list count.
 */

/** A hotel can be placed on the map only with real, non-(0,0) coordinates. */
export function hasValidCoords(p: any): boolean {
    return (
        p?.coordinates != null &&
        typeof p.coordinates.lat === 'number' &&
        typeof p.coordinates.lng === 'number' &&
        p.coordinates.lat !== 0 &&
        p.coordinates.lng !== 0
    );
}

/**
 * Collapse near-duplicate hotels — the same property returned by more than one
 * supplier (e.g. TGX + ETG) sitting within ~100m of each other — keeping the
 * cheaper entry.
 */
export function dedupeByProximity<
    T extends { coordinates: { lat: number; lng: number }; price?: number },
>(list: T[]): T[] {
    const PROX_DEG = 0.001; // ~100m
    const unique: T[] = [];
    for (const item of list) {
        const idx = unique.findIndex(
            (u) =>
                Math.abs(u.coordinates.lat - item.coordinates.lat) < PROX_DEG &&
                Math.abs(u.coordinates.lng - item.coordinates.lng) < PROX_DEG,
        );
        if (idx === -1) {
            unique.push(item);
        } else if ((item.price ?? 0) < (unique[idx].price ?? 0)) {
            unique[idx] = item;
        }
    }
    return unique;
}
