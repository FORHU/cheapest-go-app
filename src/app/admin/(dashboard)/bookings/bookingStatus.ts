/**
 * Booking status → colour, for the admin list and the detail dialog.
 *
 * Both used to carry their own copy of a substring chain — `includes('confirm')`, then
 * `includes('pend')`, then `includes('refund')`, else red — which mis-coloured 8 of the
 * 18 statuses the schema allows. Two of those were actively misleading:
 *
 *   - `booked` matched nothing and rendered red, so a successful flight looked broken.
 *   - `refund_failed` and `cancelled_refund_failed` matched `refund` before anything
 *     tested for failure, so money stuck in a failed refund looked exactly like money
 *     already returned to the customer.
 *
 * Substring order also made it fragile: `refund_pending` only lands on amber because
 * `pend` happens to be tested before `refund`.
 *
 * The vocabulary below is the union of the CHECK constraints on `unified_bookings` and
 * `flight_bookings`, plus the compound statuses the hotel `bookings` table stores.
 */

export type StatusIntent = 'success' | 'progress' | 'refunded' | 'closed' | 'failure';

const INTENTS: Record<string, StatusIntent> = {
    // Money taken, service delivered.
    confirmed:                  'success',
    ticketed:                   'success',
    booked:                     'success',

    // Mid-flight. Nothing is wrong, but nothing is final either.
    pending:                    'progress',
    awaiting_ticket:            'progress',
    ticketing:                  'progress',
    pnr_created:                'progress',
    cancel_requested:           'progress',
    refund_pending:             'progress',

    // Money returned. Distinct from both success and failure: the booking is over and
    // the customer is whole, which is neither a sale nor a problem to chase.
    refunded:                   'refunded',
    cancelled_refunded:         'refunded',

    // Ended without incident. Not an error — colouring these red trained people to
    // ignore red in this column.
    cancelled:                  'closed',
    expired:                    'closed',

    // Needs a human. A failed refund is the important one: the customer has been
    // cancelled but not paid back, and it must not look like `cancelled_refunded`.
    failed:                     'failure',
    cancel_failed:              'failure',
    refund_failed:              'failure',
    cancelled_refund_failed:    'failure',
    cancelled_provider_missing: 'failure',
};

/**
 * Unknown statuses fall back to neutral rather than red, so a value added to the schema
 * before this map does not shout. The one exception is anything naming a failure — a new
 * `*_failed` must not slip through looking benign, which is the bug this file exists to
 * fix.
 */
export function statusIntent(status: string): StatusIntent {
    const key = (status ?? '').toLowerCase().trim();
    if (INTENTS[key]) return INTENTS[key];
    if (key.includes('fail')) return 'failure';
    return 'closed';
}

const INTENT_CLASSES: Record<StatusIntent, string> = {
    success:  'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    progress: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    refunded: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    closed:   'bg-slate-500/10 text-slate-600 dark:text-slate-400',
    failure:  'bg-rose-500/10 text-rose-600 dark:text-rose-400',
};

/**
 * `min-w`, not the fixed `w-32` this replaced: "Cancelled Refund Failed" is 23 characters
 * and overflowed a 128px pill, so the text sat outside its own background. A minimum
 * keeps the short labels aligned down the column while the long ones grow to fit.
 */
export function statusBadgeClass(status: string): string {
    return [
        'inline-flex min-w-[8rem] justify-center whitespace-nowrap',
        'rounded border-none px-2.5 py-0.5 text-[10px] font-medium',
        INTENT_CLASSES[statusIntent(status)],
    ].join(' ');
}
