import type postgres from 'postgres';
import { getSqlAdmin } from '@/lib/db/postgres';
import { stripe } from '@/lib/stripe/server';
import { golfServiceFee, toStripeAmount } from '@/lib/pricing';
import { convertCurrencyStrict, refreshExchangeRates } from '@/lib/currency';
import { mintUniqueBookingReference } from '@/lib/bookingReference';
import { canonicalBrandName } from '@/lib/brand';
import { cancellationFor, decideBy, freeCancelUntil, holdExpiresAt } from '@/lib/golf/rules';
import type { GolfBooking, GolfBookingStatus, GolfCloseReason } from '@/lib/schemas/golf';
import { getBookableTeeTime } from './teeTimes';
import { GolfBookingError } from './errors';
import { sendGolfBookingEmail } from './emails';

/**
 * Golf Bookings (CONTEXT.md, "Golf Booking"): held → requested → confirmed, or expired,
 * declined, cancelled. Our tee times are not the course's own tee sheet, so checkout only
 * authorises the card; the team captures it after confirming with the course.
 *
 * Spots move only in the transactions in this file, together with the status that explains them.
 */

type DateKey = 'startsAt' | 'holdExpiresAt' | 'requestedAt' | 'decideBy' | 'confirmedAt' | 'closedAt' | 'freeCancelUntil';
type BookingRow = Omit<GolfBooking, DateKey> & {
    startsAt: Date;
    holdExpiresAt: Date;
    requestedAt: Date | null;
    decideBy: Date | null;
    confirmedAt: Date | null;
    closedAt: Date | null;
    freeCancelUntil: Date;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const iso = (d: Date | null) => (d ? d.toISOString() : null);

function toBooking(r: BookingRow): GolfBooking {
    return {
        ...r,
        currency: r.currency.trim(),
        startsAt: r.startsAt.toISOString(),
        holdExpiresAt: r.holdExpiresAt.toISOString(),
        requestedAt: iso(r.requestedAt),
        decideBy: iso(r.decideBy),
        confirmedAt: iso(r.confirmedAt),
        closedAt: iso(r.closedAt),
        freeCancelUntil: r.freeCancelUntil.toISOString(),
    };
}

function selectBookings(sql: postgres.Sql) {
    return sql`
        SELECT b.id, b.reference, b.user_id AS "userId", b.course_id AS "courseId",
               c.name AS "courseName", c.slug AS "courseSlug", c.timezone,
               b.tee_time_id AS "teeTimeId", t.starts_at AS "startsAt", b.players,
               b.lead_name AS "leadName", b.contact_email AS "contactEmail",
               b.price_per_player::float8 AS "pricePerPlayer", b.green_fee_total::float8 AS "greenFeeTotal",
               b.service_fee::float8 AS "serviceFee", b.total::float8 AS total, b.currency,
               b.payment_intent_id AS "paymentIntentId", b.status, b.hold_expires_at AS "holdExpiresAt",
               b.requested_at AS "requestedAt", b.decide_by AS "decideBy", b.confirmed_at AS "confirmedAt",
               b.closed_at AS "closedAt", b.close_reason AS "closeReason",
               b.refund_amount::float8 AS "refundAmount", b.free_cancel_until AS "freeCancelUntil"
          FROM golf_bookings b
          JOIN golf_courses c ON c.id = b.course_id
          JOIN golf_tee_times t ON t.id = b.tee_time_id`;
}

export async function getBookingById(id: string): Promise<GolfBooking | null> {
    const sql = getSqlAdmin();
    const rows = await sql<BookingRow[]>`${selectBookings(sql)} WHERE b.id = ${id}`;
    return rows[0] ? toBooking(rows[0]) : null;
}

/** A customer's own booking, or null: ownership is decided here, never in a page (ADR-0027). */
export async function getBookingForUser(reference: string, userId: string): Promise<GolfBooking | null> {
    const sql = getSqlAdmin();
    const rows = await sql<BookingRow[]>`${selectBookings(sql)} WHERE b.reference = ${reference} AND b.user_id = ${userId}`;
    return rows[0] ? toBooking(rows[0]) : null;
}

export type AdminBookingView = 'waiting' | 'upcoming' | 'past';

/** The admin queue. Abandoned checkouts (expired holds) are left out of every view. */
export async function listBookingsForAdmin(view: AdminBookingView, now = new Date()): Promise<GolfBooking[]> {
    const sql = getSqlAdmin();
    const where =
        view === 'waiting' ? sql`b.status = 'requested'`
            : view === 'upcoming' ? sql`b.status = 'confirmed' AND t.starts_at >= ${now}`
                : sql`(b.status IN ('declined', 'cancelled') OR (b.status = 'confirmed' AND t.starts_at < ${now}))`;
    const order = view === 'past' ? sql`b.updated_at DESC` : sql`t.starts_at`;
    const rows = await sql<BookingRow[]>`${selectBookings(sql)} WHERE ${where} ORDER BY ${order} LIMIT 100`;
    return rows.map(toBooking);
}

// ── Money ────────────────────────────────────────────────────────────────────

/** Releases an authorisation. Already cancelled counts as done; anything else is an error. */
async function cancelIntent(paymentIntentId: string): Promise<void> {
    try {
        await stripe.paymentIntents.cancel(paymentIntentId);
    } catch (err) {
        const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (intent.status !== 'canceled') throw err;
    }
}

async function cancelIntentQuietly(paymentIntentId: string): Promise<void> {
    try {
        await cancelIntent(paymentIntentId);
    } catch (err) {
        // An unpaid PaymentIntent left open charges nobody; it is noise, not a debt.
        console.warn('[golf] Could not cancel PaymentIntent', paymentIntentId, err);
    }
}

// ── Status changes ───────────────────────────────────────────────────────────

/**
 * Moves a booking from `from` to a final state and gives its spots back, in one transaction.
 * null when the booking was not in `from` (someone else moved it first).
 */
async function closeBooking(
    id: string,
    from: GolfBookingStatus,
    to: 'expired' | 'declined' | 'cancelled',
    reason: GolfCloseReason,
    refund = 0,
): Promise<{ paymentIntentId: string | null } | null> {
    const sql = getSqlAdmin();
    return sql.begin(async tx => {
        const [row] = await tx<{ teeTimeId: string; players: number; paymentIntentId: string | null }[]>`
            UPDATE golf_bookings
               SET status = ${to}, close_reason = ${reason}, closed_at = now(),
                   refund_amount = ${refund}, updated_at = now()
             WHERE id = ${id} AND status = ${from}
            RETURNING tee_time_id AS "teeTimeId", players, payment_intent_id AS "paymentIntentId"`;
        if (!row) return null;
        await tx`UPDATE golf_tee_times SET spots_left = LEAST(spots, spots_left + ${row.players}) WHERE id = ${row.teeTimeId}`;
        return { paymentIntentId: row.paymentIntentId };
    });
}

async function requireStatus(id: string, status: GolfBookingStatus): Promise<GolfBooking> {
    const booking = await getBookingById(id);
    if (!booking) throw new GolfBookingError('not_found', 'Booking not found.');
    if (booking.status !== status) throw new GolfBookingError('wrong_status', `This booking is ${booking.status}.`);
    return booking;
}

/**
 * Moves a held booking to `requested` once Stripe holds an authorisation for it. Called by the
 * webhook, the status page and the sweep; idempotent, and a no-op in any other state.
 */
export async function syncPayment(id: string, now = new Date()): Promise<GolfBooking | null> {
    const booking = await getBookingById(id);
    if (!booking || booking.status !== 'held' || !booking.paymentIntentId) return booking;
    const intent = await stripe.paymentIntents.retrieve(booking.paymentIntentId);
    if (intent.status !== 'requires_capture') return booking;

    const sql = getSqlAdmin();
    const moved = await sql`
        UPDATE golf_bookings
           SET status = 'requested', requested_at = ${now},
               decide_by = ${decideBy(now, new Date(booking.startsAt))}, updated_at = now()
         WHERE id = ${id} AND status = 'held'
        RETURNING id`;
    const updated = await getBookingById(id);
    if (moved.length > 0 && updated) await sendGolfBookingEmail('requested', updated);
    return updated;
}

/** Ends a hold, unless its payment went through after all, in which case it becomes a request. */
async function endHold(id: string, now: Date): Promise<'requested' | 'expired' | 'unchanged'> {
    const synced = await syncPayment(id, now);
    if (synced?.status === 'requested') return 'requested';
    const closed = await closeBooking(id, 'held', 'expired', 'hold_expired');
    if (!closed) return 'unchanged';
    if (closed.paymentIntentId) await cancelIntentQuietly(closed.paymentIntentId);
    return 'expired';
}

export interface HoldInput {
    userId: string;
    email: string;
    teeTimeId: string;
    players: number;
    leadName: string;
}

export interface HoldResult {
    booking: GolfBooking;
    clientSecret: string;
}

const notEnoughSpots = (spotsLeft: number) =>
    new GolfBookingError('not_enough_spots', `Only ${spotsLeft} spot(s) left at this tee time.`, { spotsLeft });

const PAYABLE = new Set(['requires_payment_method', 'requires_confirmation', 'requires_action']);

/** The checkout for an existing hold, while its payment can still be completed. */
async function resume(id: string): Promise<HoldResult | null> {
    const booking = await getBookingById(id);
    if (!booking?.paymentIntentId) return null;
    const intent = await stripe.paymentIntents.retrieve(booking.paymentIntentId);
    if (!PAYABLE.has(intent.status) || !intent.client_secret) return null;
    return { booking, clientSecret: intent.client_secret };
}

/**
 * Takes the spots and opens a manual-capture PaymentIntent for them. A repeated request for the
 * same tee time and party returns the hold the customer already has.
 */
export async function holdTeeTime(input: HoldInput, now = new Date()): Promise<HoldResult> {
    const sql = getSqlAdmin();

    // Expired holds on this tee time still count against it until they are closed, so close
    // them now rather than wait for the sweep. The customer's holds elsewhere end too: one
    // checkout at a time.
    const stale = await sql<{ id: string }[]>`
        SELECT id FROM golf_bookings
         WHERE status = 'held'
           AND ((tee_time_id = ${input.teeTimeId} AND hold_expires_at <= ${now})
             OR (user_id = ${input.userId} AND tee_time_id <> ${input.teeTimeId}))`;
    for (const { id } of stale) await endHold(id, now);

    const [live] = await sql<{ id: string; players: number }[]>`
        SELECT id, players FROM golf_bookings
         WHERE user_id = ${input.userId} AND tee_time_id = ${input.teeTimeId} AND status = 'held'`;
    if (live) {
        if (live.players === input.players) {
            const resumed = await resume(live.id);
            if (resumed) return resumed;
        }
        await endHold(live.id, now);
    }

    const bookable = await getBookableTeeTime(input.teeTimeId, now);
    if (!bookable) throw new GolfBookingError('tee_time_unavailable', 'That tee time can no longer be booked. Please pick another.');
    const { teeTime, course } = bookable;
    if (teeTime.spotsLeft < input.players) throw notEnoughSpots(teeTime.spotsLeft);

    const greenFeeTotal = round2(teeTime.pricePerPlayer * input.players);
    if (teeTime.currency !== 'USD') await refreshExchangeRates();
    const fee = golfServiceFee(greenFeeTotal, teeTime.currency, convertCurrencyStrict);
    const total = round2(fee.chargedTotal);
    const serviceFee = round2(total - greenFeeTotal);
    const brand = canonicalBrandName(process.env.NEXT_PUBLIC_BRAND_NAME);
    const reference = await mintUniqueBookingReference(brand, async ref =>
        (await sql`SELECT 1 FROM golf_bookings WHERE reference = ${ref}`).length > 0);

    let bookingId: string;
    try {
        bookingId = await sql.begin(async tx => {
            // The only guard against selling more spots than the tee time has.
            const taken = await tx`
                UPDATE golf_tee_times SET spots_left = spots_left - ${input.players}
                 WHERE id = ${teeTime.id} AND status = 'open' AND spots_left >= ${input.players}
                RETURNING spots_left`;
            if (taken.length === 0) throw notEnoughSpots(0);
            const [row] = await tx<{ id: string }[]>`
                INSERT INTO golf_bookings
                    (reference, user_id, course_id, tee_time_id, players, lead_name, contact_email,
                     price_per_player, green_fee_total, service_fee, total, currency,
                     hold_expires_at, free_cancel_until)
                VALUES
                    (${reference}, ${input.userId}, ${course.id}, ${teeTime.id}, ${input.players},
                     ${input.leadName}, ${input.email}, ${teeTime.pricePerPlayer}, ${greenFeeTotal},
                     ${serviceFee}, ${total}, ${teeTime.currency}, ${holdExpiresAt(now)},
                     ${freeCancelUntil(new Date(teeTime.startsAt), course.freeCancelHours)})
                RETURNING id`;
            return row.id;
        });
    } catch (err) {
        if (err instanceof GolfBookingError) {
            // Someone else took the spots between our read and the update.
            const [row] = await sql<{ spotsLeft: number }[]>`
                SELECT spots_left AS "spotsLeft" FROM golf_tee_times WHERE id = ${teeTime.id}`;
            throw notEnoughSpots(row?.spotsLeft ?? 0);
        }
        const e = err as { code?: string; constraint_name?: string };
        if (e?.code === '23505' && e.constraint_name === 'uq_golf_bookings_live_hold') {
            // The same customer asked twice at once, and the other request made the hold.
            throw new GolfBookingError('payment_unavailable', 'Your tee time is already being held. Please try again.');
        }
        throw err;
    }

    try {
        const intent = await stripe.paymentIntents.create({
            amount: toStripeAmount(total, teeTime.currency),
            currency: teeTime.currency.toLowerCase(),
            // Authorise now, capture when the team has confirmed with the course.
            capture_method: 'manual',
            metadata: {
                bookingReference: reference,
                brand,
                type: 'golf',
                golfBookingId: bookingId,
                userId: input.userId,
                courseSlug: course.slug,
                teeTimeStartsAt: teeTime.startsAt,
                greenFeeTotal: String(greenFeeTotal),
                serviceFee: String(serviceFee),
                markupRate: String(fee.markupRate),
            },
            description: `${reference} · ${course.name} — tee time`,
        }, { idempotencyKey: `golf-pi-${bookingId}` });
        await sql`UPDATE golf_bookings SET payment_intent_id = ${intent.id}, updated_at = now() WHERE id = ${bookingId}`;
        const booking = await getBookingById(bookingId);
        return { booking: booking!, clientSecret: intent.client_secret! };
    } catch (err) {
        console.error('[golf] Could not start payment for', reference, err);
        await closeBooking(bookingId, 'held', 'expired', 'hold_expired');
        throw new GolfBookingError('payment_unavailable', "We couldn't start the payment. Please try again.");
    }
}

/** The team has checked with the course: take the money. A failed capture changes nothing. */
export async function confirmBooking(id: string, now = new Date()): Promise<GolfBooking> {
    const booking = await requireStatus(id, 'requested');
    await stripe.paymentIntents.capture(booking.paymentIntentId!, {}, { idempotencyKey: `golf-capture-${id}` });
    const sql = getSqlAdmin();
    await sql`
        UPDATE golf_bookings SET status = 'confirmed', confirmed_at = ${now}, updated_at = now()
         WHERE id = ${id} AND status = 'requested'`;
    const updated = (await getBookingById(id))!;
    await sendGolfBookingEmail('confirmed', updated);
    return updated;
}

/** The course cannot take it, or nobody decided in time: release the card and the spots. */
export async function declineBooking(
    id: string,
    reason: 'declined_by_team' | 'not_confirmed_in_time' = 'declined_by_team',
): Promise<GolfBooking> {
    const booking = await requireStatus(id, 'requested');
    await cancelIntent(booking.paymentIntentId!);
    await closeBooking(id, 'requested', 'declined', reason);
    const updated = (await getBookingById(id))!;
    await sendGolfBookingEmail('declined', updated);
    return updated;
}

/** The customer cancels; what that does is cancellationFor's decision. */
export async function cancelByCustomer(reference: string, userId: string, now = new Date()): Promise<GolfBooking> {
    const booking = await getBookingForUser(reference, userId);
    if (!booking) throw new GolfBookingError('not_found', 'Booking not found.');
    const decision = cancellationFor(
        { status: booking.status, total: booking.total, freeCancelUntil: new Date(booking.freeCancelUntil) },
        now,
    );
    if (!decision.allowed) {
        throw new GolfBookingError(
            decision.reason,
            decision.reason === 'free_cancellation_ended'
                ? 'Free cancellation has ended for this tee time.'
                : 'This booking cannot be cancelled.',
        );
    }
    if (decision.charged) {
        await stripe.refunds.create(
            { payment_intent: booking.paymentIntentId!, amount: toStripeAmount(decision.refund, booking.currency) },
            { idempotencyKey: `golf-refund-${booking.id}` },
        );
        await closeBooking(booking.id, 'confirmed', 'cancelled', 'cancelled_by_customer', decision.refund);
    } else {
        await cancelIntent(booking.paymentIntentId!);
        await closeBooking(booking.id, 'requested', 'cancelled', 'cancelled_by_customer');
    }
    const updated = (await getBookingById(booking.id))!;
    await sendGolfBookingEmail('cancelled', updated);
    return updated;
}

/** The course closed or rain stopped play: a confirmed booking is refunded in full. */
export async function cancelByTeam(id: string): Promise<GolfBooking> {
    const booking = await requireStatus(id, 'confirmed');
    await stripe.refunds.create(
        { payment_intent: booking.paymentIntentId!, amount: toStripeAmount(booking.total, booking.currency) },
        { idempotencyKey: `golf-refund-${id}` },
    );
    await closeBooking(id, 'confirmed', 'cancelled', 'cancelled_by_team', booking.total);
    const updated = (await getBookingById(id))!;
    await sendGolfBookingEmail('cancelled', updated);
    return updated;
}

/**
 * Ends unpaid holds (or turns them into requests when the payment went through after all) and
 * declines requests nobody decided by their deadline. Run by cron every few minutes.
 */
export async function sweepGolfBookings(now = new Date()): Promise<{ requested: number; expired: number; declined: number; failed: number }> {
    const sql = getSqlAdmin();
    const result = { requested: 0, expired: 0, declined: 0, failed: 0 };

    const holds = await sql<{ id: string }[]>`
        SELECT id FROM golf_bookings
         WHERE status = 'held' AND hold_expires_at <= ${now}
         ORDER BY hold_expires_at LIMIT 200`;
    for (const { id } of holds) {
        try {
            const outcome = await endHold(id, now);
            if (outcome === 'requested') result.requested++;
            if (outcome === 'expired') result.expired++;
        } catch (err) {
            result.failed++;
            console.error('[golf] Sweep could not end hold', id, err);
        }
    }

    const overdue = await sql<{ id: string }[]>`
        SELECT id FROM golf_bookings
         WHERE status = 'requested' AND decide_by <= ${now}
         ORDER BY decide_by LIMIT 200`;
    for (const { id } of overdue) {
        try {
            await declineBooking(id, 'not_confirmed_in_time');
            result.declined++;
        } catch (err) {
            result.failed++;
            console.error('[golf] Sweep could not decline overdue request', id, err);
        }
    }
    return result;
}
