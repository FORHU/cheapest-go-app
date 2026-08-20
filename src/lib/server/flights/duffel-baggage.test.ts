import { describe, it, expect } from 'vitest';
import { parseDuffelOffer } from './providers/duffel';

/**
 * Cover for the included-baggage badges on the search card.
 *
 * Duffel reports the allowance per segment per passenger, and an offer's segments
 * need not agree. The card must advertise only what holds on every leg.
 */

function segment(baggages: unknown, flightNumber = '1007') {
    return {
        operating_carrier: { iata_code: 'KE', name: 'Korean Air' },
        marketing_carrier: { iata_code: 'KE', name: 'Korean Air' },
        marketing_carrier_flight_number: flightNumber,
        origin: { iata_code: 'GMP' },
        destination: { iata_code: 'CJU' },
        departing_at: '2026-08-28T06:35:00',
        arriving_at: '2026-08-28T07:50:00',
        duration: 'PT1H15M',
        passengers: baggages === undefined ? [{ cabin_class: 'economy' }] : [{ cabin_class: 'economy', baggages }],
    };
}

function offerWith(segments: unknown[]) {
    return {
        id: 'off_test',
        total_amount: '238.00',
        total_currency: 'USD',
        owner: { name: 'Korean Air' },
        passengers: [{ type: 'adult' }],
        slices: [{ duration: 'PT1H15M', segments }],
    };
}

describe('parseDuffelOffer — baggage allowance', () => {
    it('reads carry-on and checked counts from the segment', () => {
        const parsed: any = parseDuffelOffer(offerWith([
            segment([{ type: 'carry_on', quantity: 1 }, { type: 'checked', quantity: 2 }]),
        ]));
        expect(parsed.baggage).toEqual({ carryOnBags: 1, checkedBags: 2 });
    });

    it('takes the smallest allowance across segments, not the first', () => {
        // Long leg includes a checked bag; the connection does not. The traveller
        // effectively has none, so the card must not advertise one.
        const parsed: any = parseDuffelOffer(offerWith([
            segment([{ type: 'carry_on', quantity: 1 }, { type: 'checked', quantity: 1 }], '1007'),
            segment([{ type: 'carry_on', quantity: 1 }, { type: 'checked', quantity: 0 }], '1008'),
        ]));
        expect(parsed.baggage).toEqual({ carryOnBags: 1, checkedBags: 0 });
    });

    it('distinguishes an explicit zero from an unstated allowance', () => {
        const explicitZero: any = parseDuffelOffer(offerWith([
            segment([{ type: 'checked', quantity: 0 }]),
        ]));
        // carry_on absent from the array means zero free carry-on, not "unknown"
        expect(explicitZero.baggage).toEqual({ carryOnBags: 0, checkedBags: 0 });

        const unstated: any = parseDuffelOffer(offerWith([segment(undefined)]));
        expect(unstated.baggage).toBeUndefined();
    });

    it('sums multiple entries of the same bag type', () => {
        const parsed: any = parseDuffelOffer(offerWith([
            segment([{ type: 'checked', quantity: 1 }, { type: 'checked', quantity: 1 }]),
        ]));
        expect(parsed.baggage?.checkedBags).toBe(2);
    });

    it('ignores a malformed baggages payload rather than throwing', () => {
        const parsed: any = parseDuffelOffer(offerWith([segment('not-an-array')]));
        expect(parsed.baggage).toBeUndefined();
    });
});
