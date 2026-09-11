import { describe, it, expect } from 'vitest';
import {
    applyMarkup,
    calculateStripeFee,
    bundleSavingPercent,
    enrichBookingFinances,
    fromStripeAmount,
    toStripeAmount,
    type MarkupSpec,
} from './pricing';

/**
 * The markup recovers Platform Cost, which is flat plus proportional — Duffel
 * charges $3.00 per paid order on top of 1% of order value, and Stripe charges a
 * flat fee on top of a rate. These tests pin the arithmetic that follows from
 * that, and in particular the two places it can silently go wrong: the cap, and
 * the flat component's currency. See ADR-0036.
 */

/** Flights: 7.2% + $4.40, capped at 12%. */
const FLIGHTS: MarkupSpec = { rate: 0.072, flat: 4.40, cap: 0.12 };

/** Hotels: 5.9% + $0.40 — the flat part covers Stripe's $0.30, not a supplier fee. */
const HOTELS: MarkupSpec = { rate: 0.059, flat: 0.40, cap: 0.12 };

/** What Duffel and Stripe actually take on one order, given a base fare and a charge. */
function platformCost(base: number, charged: number): number {
    const duffel = 3.00 + base * 0.01;
    return duffel + calculateStripeFee(charged);
}

describe('applyMarkup', () => {
    it('adds the flat component and the rate, not just the rate', () => {
        const p = applyMarkup(500, FLIGHTS);
        expect(p.markupAmount).toBe(40.40); // 500 × 7.2% + 4.40
        expect(p.chargedPrice).toBe(540.40);
        expect(p.markupFlat).toBe(4.40);
        expect(p.capped).toBe(false);
    });

    it('reports the effective rate, not the configured one', () => {
        // markup_pct is stored from this, so it has to agree with the amounts
        // beside it — a booking that recorded 7.2% while collecting 8.08% would
        // make every reverse-derivation in reporting wrong.
        const p = applyMarkup(500, FLIGHTS);
        expect(p.markupRate).toBeCloseTo(40.40 / 500, 6);
        expect(p.markupRate).not.toBe(FLIGHTS.rate);
    });

    it('caps the fee on a cheap fare, where the flat part would dominate', () => {
        // 7.2% + $4.40 on $50 is $8.00 — a 16% jump at checkout. The cap holds
        // it to 12%, which is the whole reason the cap exists.
        const p = applyMarkup(50, FLIGHTS);
        expect(p.capped).toBe(true);
        expect(p.markupAmount).toBe(6.00);
        expect(p.markupRate).toBe(0.12);
    });

    it('binds the cap below roughly $92 and not above it', () => {
        expect(applyMarkup(90, FLIGHTS).capped).toBe(true);
        expect(applyMarkup(93, FLIGHTS).capped).toBe(false);
    });

    it('uses the converted flat fee when the base is not in USD', () => {
        // The flat component is USD-denominated because Duffel's $3.00 and
        // Stripe's $0.30 are. Adding 4.40 to a PHP fare would charge ₱4.40 —
        // about seven US cents — and silently under-recover on every booking.
        const php = applyMarkup(30000, FLIGHTS, 270);   // ~$4.40 at ₱61/USD
        const naive = applyMarkup(30000, FLIGHTS);      // wrong: ₱4.40
        expect(php.markupAmount).toBe(2430);            // 30000 × 7.2% + 270
        expect(php.markupAmount - naive.markupAmount).toBeCloseTo(265.60, 2);
    });

    it('degrades to the proportional part when the flat fee cannot be converted', () => {
        // The booking routes fall back to 0 rather than throwing, because a live
        // ticket may already exist and stranding one costs far more than $4.40.
        const p = applyMarkup(500, FLIGHTS, 0);
        expect(p.markupAmount).toBe(36.00);
        expect(p.markupFlat).toBe(0);
    });

    it('charges nothing on a zero or negative base', () => {
        // A flat fee on a zero base is unbounded as a rate, and there is nothing
        // for the cap to bite on.
        for (const base of [0, -100]) {
            const p = applyMarkup(base, FLIGHTS);
            expect(p.markupAmount).toBe(0);
            expect(p.markupRate).toBe(0);
            expect(p.chargedPrice).toBe(p.originalPrice);
        }
    });

    it('applies a small flat component to hotels, covering Stripe only', () => {
        // Hotels were a flat 5% while Stripe was assumed to be 2.9%. Measuring it
        // at 4.4% left a $300 stay netting $0.84, so the supposed provision
        // against TravelgateX's incoming fee did not exist.
        const p = applyMarkup(600, HOTELS);
        expect(p.markupAmount).toBe(35.80);  // 600 × 5.9% + 0.40
        expect(p.markupFlat).toBe(0.40);
        // Stored to 4 dp, because that is what lands in markup_pct — an exact
        // 35.80/600 would assert a precision the column never keeps.
        expect(p.markupRate).toBe(0.0597);
    });
});

describe('the flight markup against real Platform Cost', () => {
    // The old flat 4% was below break-even at every fare — it converged to
    // 4.017% as the fare went to infinity, so no ticket price made it solvent.
    it('beats the old 4% rate at every fare', () => {
        const OLD: MarkupSpec = { rate: 0.04, flat: 0, cap: 1 };
        for (const base of [100, 300, 830, 2000]) {
            const old = applyMarkup(base, OLD);
            expect(old.markupAmount).toBeLessThan(platformCost(base, old.chargedPrice));
            expect(applyMarkup(base, FLIGHTS).markupAmount).toBeGreaterThan(old.markupAmount);
        }
    });

    it('recovers Platform Cost on an uncancelled booking above the cap', () => {
        for (const base of [100, 300, 830, 2000]) {
            const p = applyMarkup(base, FLIGHTS);
            expect(p.capped).toBe(false);
            expect(p.markupAmount).toBeGreaterThan(platformCost(base, p.chargedPrice));
        }
    });

    // Where the cap *binds* and where it *loses money* are two different fares,
    // and conflating them overstates what the cap costs. The cap binds below ~$92,
    // because that is where 7.2% + $4.40 exceeds 12% of the fare. It only stops
    // covering Platform Cost below ~$54, where 12% of the fare drops under
    // break-even, 0.0565·P + 3.45.
    it('still covers Platform Cost between roughly $54 and the cap at $92', () => {
        for (const base of [60, 70, 80]) {
            const p = applyMarkup(base, FLIGHTS);
            expect(p.capped).toBe(true);
            expect(p.markupAmount).toBeGreaterThan(platformCost(base, p.chargedPrice));
        }
    });

    it('under-recovers below roughly $54, by design and by a bounded amount', () => {
        // Deliberate: the cap trades a small loss on the cheapest fares for a
        // checkout jump travellers will accept. The bound is what makes it a
        // trade rather than an open-ended subsidy — the shortfall tends to the
        // $3.45 flat break-even as the fare tends to zero, and never exceeds it.
        for (const base of [10, 30, 50]) {
            const p = applyMarkup(base, FLIGHTS);
            const shortfall = platformCost(base, p.chargedPrice) - p.markupAmount;
            expect(shortfall).toBeGreaterThan(0);
            expect(shortfall).toBeLessThan(3.5);
        }
    });
});

describe('fromStripeAmount', () => {
    it('divides by 100 for a currency that has a subunit', () => {
        expect(fromStripeAmount(52980, 'usd')).toBe(529.80);
        expect(fromStripeAmount(150000, 'php')).toBe(1500);
    });

    it('does NOT divide for a zero-decimal currency', () => {
        // The bug this replaces: `pi.amount / 100` was hardcoded in fourteen
        // places, so a ₩1,200,000 booking quoted the customer a ₩12,000 refund.
        expect(fromStripeAmount(1_200_000, 'krw')).toBe(1_200_000);
        expect(fromStripeAmount(50_000, 'jpy')).toBe(50_000);
    });

    it('round-trips toStripeAmount in both currency shapes', () => {
        for (const [price, currency] of [[529.80, 'usd'], [1_200_000, 'krw'], [1500, 'php']] as const) {
            expect(fromStripeAmount(toStripeAmount(price, currency), currency)).toBe(price);
        }
    });

    it('is case-insensitive, since Stripe returns lowercase codes', () => {
        expect(fromStripeAmount(1_200_000, 'KRW')).toBe(fromStripeAmount(1_200_000, 'krw'));
    });
});

describe('enrichBookingFinances', () => {
    const booking = (over: Partial<Parameters<typeof enrichBookingFinances>[0]> = {}) => ({
        type: 'flight',
        totalAmount: 520,
        supplierCost: 500,
        markupAmount: 0,
        profit: 0,
        ...over,
    });

    it('reads the rate off the booking, not off the configured rate', () => {
        // The shape every row in the dev database actually has: a supplier cost
        // recorded, no markup_pct. This used to display whatever FLIGHT_MARKUP
        // happened to be today, so after this change it would have shown 5.1%
        // against a booking sold at 4%.
        const e = enrichBookingFinances(booking());
        expect(e.markupAmount).toBe(20);
        expect(e.markupPercentage).toBe(4);      // 20 / 500, what it really carried
        expect(e.isEstimated).toBe(false);
    });

    it('reports a gap rather than inventing a margin when nothing was recorded', () => {
        // Inverting `totalAmount / (1 + rate)` has no term for a flat component,
        // so a fabricated figure here would be plausible and wrong — and this is
        // the fallback path, so it would be banked rather than investigated.
        const e = enrichBookingFinances(booking({ supplierCost: 0 }));
        expect(e.markupAmount).toBe(0);
        expect(e.markupPercentage).toBe(0);
        expect(e.isEstimated).toBe(true);
    });

    it('still inverts a rate the booking itself recorded', () => {
        const e = enrichBookingFinances(booking({ supplierCost: 0, markup_pct: 0.04 }));
        expect(e.supplierCost).toBe(500);        // 520 / 1.04
        expect(e.markupAmount).toBe(20);
        expect(e.isEstimated).toBe(true);
    });
});

describe('bundleSavingPercent', () => {
    it('is zero, because bundling has no cost saving behind it', () => {
        // It used to be the gap between HOTEL_MARKUP and BUNDLE_MARKUP, funded
        // out of a hotel rate now committed to TravelgateX's incoming fee.
        expect(bundleSavingPercent()).toBe(0);
    });
});
