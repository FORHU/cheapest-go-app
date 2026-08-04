/** The only values Duffel accepts for `cabin_class`. */
const DUFFEL_CABIN_CLASSES = new Set(['economy', 'premium_economy', 'business', 'first']);

/**
 * Coerce a value to a Duffel `cabin_class`, or undefined if it isn't one.
 *
 * `cabin_class` is an enum; `cabin_class_marketing_name` is the airline's own
 * label for the fare and is not interchangeable with it — on CRK→NRT alone the
 * marketing names come back as "Economy", "ECO" and "ECOPREMIUM". Lowercasing
 * one of those and posting it as cabin_class produces
 * `Field 'cabin_class' must be one of ...`, which killed the offer auto-refresh
 * for every airline that does not happen to spell its cabin exactly "Economy".
 */
export function normaliseCabinClass(raw: unknown): string | undefined {
    if (typeof raw !== 'string') return undefined;
    const value = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
    return DUFFEL_CABIN_CLASSES.has(value) ? value : undefined;
}

/**
 * Pick the cabin to re-quote a raw Duffel offer in.
 *
 * Duffel omits `cabin_class` at the offer root, so the per-passenger field on
 * the first segment is the reliable source. Falls back to economy only when the
 * offer carries no recognisable cabin at all.
 */
export function cabinClassFromRawOffer(rawOffer: any): string {
    return normaliseCabinClass(rawOffer?.cabin_class)
        ?? normaliseCabinClass(rawOffer?.slices?.[0]?.segments?.[0]?.passengers?.[0]?.cabin_class)
        ?? 'economy';
}
