import { createHash } from 'crypto';

/**
 * The amount to pay Duffel for an offer plus the selected ancillaries.
 *
 * Service prices always come from `available_services` on the offer itself, never from the
 * client's `seatTotal`/`bagTotal` — Duffel validates `payments.amount` against its own
 * arithmetic and rejects a mismatch.
 *
 * Copied from the same-named function in /api/flights/book/route.ts; the route's copy goes
 * when FLIGHT_PAY_FIRST is retired.
 */
export function computeOrderTotal(
    rawOffer: any,
    seatServiceIds: string[] | undefined,
    bagServiceIds: string[] | undefined,
    warn = false,
): { total: string; base: number; seatExtra: number; bagExtra: number } {
    const base = parseFloat(rawOffer?.total_amount ?? '0');
    const availableSvcs: any[] = rawOffer?.available_services ?? [];

    const sumFor = (ids: string[] | undefined, label: string) => {
        let sum = 0;
        for (const id of ids ?? []) {
            const svc = availableSvcs.find((s: any) => s.id === id);
            if (svc) sum += parseFloat(svc.total_amount ?? '0');
            else if (warn) console.warn(`[flight-quote] ${label} service ${id} not in available_services — excluding from order`);
        }
        return sum;
    };

    const seatExtra = sumFor(seatServiceIds, 'seat');
    const bagExtra = sumFor(bagServiceIds, 'bag');

    return { total: (base + seatExtra + bagExtra).toFixed(2), base, seatExtra, bagExtra };
}

export interface QuoteHashInput {
    offerId: string;
    passengers: Array<{ firstName?: string; lastName?: string; birthDate?: string }>;
    seatServiceIds?: string[];
    bagServiceIds?: string[];
    chargeCurrency: string;
    /** The PaymentIntent amount, so a re-quote at a different price is a different booking. */
    amountMinor: number;
}

/**
 * Identity of "this exact booking attempt".
 *
 * Two submits with the same hash are the same attempt and must share one session and one
 * PaymentIntent; a corrected name, an added bag or a moved price produces a new hash and so
 * a new attempt. Names are normalised so a stray space or capital does not split an attempt.
 */
export function quoteHash(input: QuoteHashInput): string {
    const norm = (s?: string) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    const canonical = JSON.stringify({
        o: input.offerId,
        p: (input.passengers ?? []).map(p => [norm(p.firstName), norm(p.lastName), (p.birthDate ?? '').trim()]),
        s: [...(input.seatServiceIds ?? [])].sort(),
        b: [...(input.bagServiceIds ?? [])].sort(),
        c: input.chargeCurrency.trim().toLowerCase(),
        a: input.amountMinor,
    });
    return createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}
