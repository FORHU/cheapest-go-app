/**
 * Record that we are about to ask a supplier to book or cancel something.
 *
 * Written *before* the call, not after. A supplier mutation that times out, throws, or is
 * killed mid-flight has still very likely reached the supplier — logging on success would
 * miss exactly the cases worth having, and logging after the fact would miss the ones that
 * never came back.
 *
 * The gap this closes: on 2026-09-06 a live OTV hotel booking (CG-770AZS) existed at the
 * supplier and nowhere in this database. `bookings` is written by confirmAndSaveTgxBooking,
 * one level above the route that performs the mutation, so any caller reaching the route
 * directly booked real inventory invisibly. Recording inside the route means the trace
 * does not depend on which caller took which path.
 */

import { getSqlAdmin } from '@/lib/db/postgres';
import { canonicalBrandName } from '@/lib/brand';

export type SupplierOperation = 'book' | 'cancel';

export interface AttemptStart {
    provider: string;
    operation: SupplierOperation;
    clientReference?: string | null;
    supplierReference?: string | null;
    hotelCode?: string | null;
    /** Request headers, so an unexpected caller can be identified after the fact. */
    headers?: Headers;
}

export interface AttemptOutcome {
    status: 'confirmed' | 'failed';
    supplierReference?: string | null;
    hotelCode?: string | null;
    hotelName?: string | null;
    priceGross?: number | null;
    currency?: string | null;
    error?: string | null;
}

/**
 * Cloudflare sits in front, so the socket address is the edge. `cf-connecting-ip` is the
 * only header that names the real caller; the others are recorded as fallbacks for calls
 * that arrive without it.
 */
function callerIp(headers?: Headers): string | null {
    if (!headers) return null;
    return headers.get('cf-connecting-ip')
        ?? headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        ?? headers.get('x-real-ip')
        ?? null;
}

/**
 * Opens an attempt row and returns its id, or null if it could not be written.
 *
 * Never throws. By the time a book call is made the customer has usually already been
 * charged, so refusing to proceed because the audit row failed would turn a logging outage
 * into lost bookings and stranded payments. A failure here is loud in the logs and leaves
 * the very gap this table exists to close — which is the lesser harm, but only just.
 */
export async function startSupplierAttempt(input: AttemptStart): Promise<string | null> {
    try {
        const sql = getSqlAdmin();
        const rows = await sql<{ id: string }[]>`
            INSERT INTO supplier_booking_attempts (
                provider, operation, client_reference, supplier_reference,
                hotel_code, status, source_brand, caller_ip, caller_agent
            ) VALUES (
                ${input.provider}, ${input.operation},
                ${input.clientReference ?? null}, ${input.supplierReference ?? null},
                ${input.hotelCode ?? null}, 'attempted',
                ${canonicalBrandName(process.env.NEXT_PUBLIC_BRAND_NAME)},
                ${callerIp(input.headers)},
                ${input.headers?.get('user-agent')?.slice(0, 300) ?? null}
            )
            RETURNING id`;
        return rows[0]?.id ?? null;
    } catch (err: any) {
        console.error(
            `[supplier-attempt] COULD NOT RECORD ${input.operation} to ${input.provider} ` +
            `(ref ${input.clientReference ?? '-'}): ${err?.message}. Proceeding untraced.`
        );
        return null;
    }
}

/** Closes an attempt. A no-op when the open failed, so callers need no null handling. */
export async function finishSupplierAttempt(id: string | null, outcome: AttemptOutcome): Promise<void> {
    if (!id) return;
    try {
        const sql = getSqlAdmin();
        await sql`
            UPDATE supplier_booking_attempts SET
                status             = ${outcome.status},
                supplier_reference = COALESCE(${outcome.supplierReference ?? null}, supplier_reference),
                hotel_code         = COALESCE(${outcome.hotelCode ?? null}, hotel_code),
                hotel_name         = ${outcome.hotelName ?? null},
                price_gross        = ${outcome.priceGross ?? null},
                currency           = ${outcome.currency ?? null},
                error              = ${outcome.error?.slice(0, 500) ?? null},
                completed_at       = now()
            WHERE id = ${id}`;
    } catch (err: any) {
        // The attempt row survives with completed_at NULL, which reads as "we asked and do
        // not know the outcome" — the honest state, and the one the open-attempts index finds.
        console.error(`[supplier-attempt] Could not close attempt ${id}: ${err?.message}`);
    }
}
