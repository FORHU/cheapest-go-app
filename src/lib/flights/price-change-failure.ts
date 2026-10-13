export interface PriceChangeData {
    oldPrice: number;
    newPrice: number;
    currency: string;
}

/**
 * The new fare, when a failure after authorisation was "the price moved".
 *
 * Returned by /confirm and /booking-status as `{ errorCode: 'price_changed', priceChange }`. Null
 * for anything else, and for a malformed one: prompting a traveller with "NaN" is worse than the
 * generic failure screen.
 */
export function priceChangeFromFailure(data: any): PriceChangeData | null {
    if (data?.errorCode !== 'price_changed') return null;
    const change = data.priceChange;
    if (
        typeof change?.oldPrice !== 'number' || !Number.isFinite(change.oldPrice)
        || typeof change?.newPrice !== 'number' || !Number.isFinite(change.newPrice)
        || typeof change?.currency !== 'string' || change.currency.length === 0
    ) return null;
    return { oldPrice: change.oldPrice, newPrice: change.newPrice, currency: change.currency };
}
