import { describe, it, expect } from 'vitest';
import { parseDuffelOffer } from './providers/duffel';

/**
 * The itinerary timeline names the allowance on each leg it draws.
 *
 * The offer-level `baggage` badge stays what it was — the smallest allowance across
 * every segment, because that is all a traveller is guaranteed for the whole journey.
 * But collapsing to that minimum was the only record we kept, so a leg that really did
 * include a checked bag could not say so. Each segment now carries its own allowance
 * as well, and the offer-level minimum is derived from the same facts.
 */

function segment(baggages: unknown, flightNumber = '1007', origin = 'GMP', destination = 'CJU') {
    return {
        operating_carrier: { iata_code: 'KE', name: 'Korean Air' },
        marketing_carrier: { iata_code: 'KE', name: 'Korean Air' },
        marketing_carrier_flight_number: flightNumber,
        origin: { iata_code: origin },
        destination: { iata_code: destination },
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
        slices: [{ duration: 'PT2H30M', segments }],
    };
}

describe('parseDuffelOffer — per-segment baggage', () => {
    it('gives each segment the allowance that segment actually carries', () => {
        const parsed: any = parseDuffelOffer(offerWith([
            segment([{ type: 'carry_on', quantity: 1 }, { type: 'checked', quantity: 1 }], '1007', 'GMP', 'ICN'),
            segment([{ type: 'carry_on', quantity: 1 }, { type: 'checked', quantity: 0 }], '1008', 'ICN', 'CJU'),
        ]));

        expect(parsed.segments[0].baggage).toEqual({ carryOnBags: 1, checkedBags: 1 });
        expect(parsed.segments[1].baggage).toEqual({ carryOnBags: 1, checkedBags: 0 });
    });

    it('leaves the offer-level minimum untouched', () => {
        const parsed: any = parseDuffelOffer(offerWith([
            segment([{ type: 'carry_on', quantity: 1 }, { type: 'checked', quantity: 1 }], '1007', 'GMP', 'ICN'),
            segment([{ type: 'carry_on', quantity: 1 }, { type: 'checked', quantity: 0 }], '1008', 'ICN', 'CJU'),
        ]));

        // The connection refuses the checked bag, so the journey does not include one.
        expect(parsed.baggage).toEqual({ carryOnBags: 1, checkedBags: 0 });
    });

    it('says nothing about a segment the airline said nothing about', () => {
        const parsed: any = parseDuffelOffer(offerWith([segment(undefined)]));

        // Absent, not zero: "no free bag" and "we were not told" are different facts.
        expect(parsed.segments[0].baggage).toBeUndefined();
    });

    it('records a zero allowance as zero, not as unknown', () => {
        const parsed: any = parseDuffelOffer(offerWith([
            segment([{ type: 'carry_on', quantity: 1 }, { type: 'checked', quantity: 0 }]),
        ]));

        expect(parsed.segments[0].baggage).toEqual({ carryOnBags: 1, checkedBags: 0 });
    });
});
