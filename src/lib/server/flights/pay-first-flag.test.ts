import { describe, it, expect } from 'vitest';
import { isPayFirstEnabled } from './pay-first-flag';

describe('isPayFirstEnabled', () => {
    it('is on only for the literal value "on"', () => {
        expect(isPayFirstEnabled({ FLIGHT_PAY_FIRST: 'on' })).toBe(true);
        expect(isPayFirstEnabled({ FLIGHT_PAY_FIRST: 'off' })).toBe(false);
        expect(isPayFirstEnabled({ FLIGHT_PAY_FIRST: 'true' })).toBe(false);
        expect(isPayFirstEnabled({})).toBe(false);
    });
});
