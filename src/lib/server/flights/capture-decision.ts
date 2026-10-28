/**
 * After the card is authorised and the airline order exists: how much of the hold to capture.
 *
 * The hold was sized to the quote. Duffel's real total can differ by the time the order is
 * placed:
 *   cheaper                 -> capture the proportionally smaller charge (never the full hold)
 *   dearer, within tolerance -> absorb it; capture the quoted charge
 *   dearer, beyond tolerance -> release; the traveller must see the new price before paying it
 *
 * A hold cannot be raised after authorisation, so "dearer" can only ever be absorbed or refused.
 */
export interface CaptureInput {
    /** The authorised amount, in the currency's minor units. */
    authorizedMinor: number;
    /** What the quote was built from (supplier currency, incl. ancillaries). */
    quotedBase: number;
    /** What the airline order actually cost, same units as `quotedBase`. */
    finalBase: number;
    /** Absolute rise (supplier currency) treated as unchanged. */
    tolerance: number;
    /** Marked-up charge for a given base, in the supplier currency. */
    chargedFor: (base: number) => number;
}

export type CaptureDecision =
    | { kind: 'capture'; amountMinor: number }
    | { kind: 'release'; code: 'price_changed' };

export function decideCapture({ authorizedMinor, quotedBase, finalBase, tolerance, chargedFor }: CaptureInput): CaptureDecision {
    // A price we cannot read is not evidence of a discount. Capture what was authorised.
    if (!(quotedBase > 0) || !(finalBase > 0)) return { kind: 'capture', amountMinor: authorizedMinor };

    if (finalBase > quotedBase + tolerance) return { kind: 'release', code: 'price_changed' };
    if (finalBase >= quotedBase) return { kind: 'capture', amountMinor: authorizedMinor };

    const ratio = chargedFor(finalBase) / chargedFor(quotedBase);
    const scaled = Math.min(authorizedMinor, Math.round(authorizedMinor * ratio));
    return { kind: 'capture', amountMinor: Math.max(1, scaled) };
}
