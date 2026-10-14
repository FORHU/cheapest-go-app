/**
 * The statuses a cancellation seen at Duffel may be reconciled from.
 *
 * In a file of its own, with no server imports, because three places must agree on it: the webhook,
 * the pull check (both server) and the Trips card, which only asks Duffel about a booking in one of
 * these. The server decides in the end; the card's copy is an economy, not the rule.
 *
 * Not `cancel_requested`: that means the traveller's own Cancel is working on the booking and owns
 * it, and a second cancellation alongside it could refund twice. Not `refund_failed` either: it has
 * its own retry.
 */
export const DUFFEL_RECONCILABLE_STATUSES: string[] = [
    'ticketed', 'confirmed', 'booked', 'pnr_created', 'awaiting_ticket', 'cancel_failed',
];
