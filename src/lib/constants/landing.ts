/**
 * Landing page display defaults.
 * Used when the corresponding fields are missing from the database row.
 */

/** Multiplier applied to average_price to derive a "was" price for destinations */
export const DESTINATION_PRICE_MARKUP = 1.2;

/** Amenity badges shown on vacation package cards when DB doesn't provide includes */
export const DESTINATION_INCLUDES_DEFAULT = ['Flight + Hotel', 'Free Baggage'];

/** Fallback star rating shown when DB row has no rating */
export const DESTINATION_RATING_DEFAULT = 4.8;

/** Fallback review count shown when DB row has no review count */
export const DESTINATION_REVIEWS_DEFAULT = 1240;
