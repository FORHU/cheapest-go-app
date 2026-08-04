import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    getFlightPriceTolerance,
    FLIGHT_PRICE_TOLERANCE_LIVE,
    FLIGHT_PRICE_TOLERANCE_SANDBOX,
} from './pricing';

/**
 * The sandbox threshold is 20× the live one, so a fare that drifts $2 books
 * cleanly in testing and is rejected against a real airline. The override exists
 * so a local run can be a faithful rehearsal.
 */
const SAVED = {
    token: process.env.DUFFEL_ACCESS_TOKEN,
    alias: process.env.DUFFEL_TOKEN,
    override: process.env.FLIGHT_PRICE_TOLERANCE,
};

beforeEach(() => {
    delete process.env.DUFFEL_ACCESS_TOKEN;
    delete process.env.DUFFEL_TOKEN;
    delete process.env.FLIGHT_PRICE_TOLERANCE;
});

afterEach(() => {
    for (const [k, v] of [
        ['DUFFEL_ACCESS_TOKEN', SAVED.token],
        ['DUFFEL_TOKEN', SAVED.alias],
        ['FLIGHT_PRICE_TOLERANCE', SAVED.override],
    ] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
});

describe('getFlightPriceTolerance', () => {
    it('is loose on a sandbox token', () => {
        process.env.DUFFEL_ACCESS_TOKEN = 'duffel_test_abc';
        expect(getFlightPriceTolerance()).toBe(FLIGHT_PRICE_TOLERANCE_SANDBOX);
    });

    it('is tight on a live token', () => {
        process.env.DUFFEL_ACCESS_TOKEN = 'duffel_live_abc';
        expect(getFlightPriceTolerance()).toBe(FLIGHT_PRICE_TOLERANCE_LIVE);
    });

    it('defaults to the live threshold when no token is set', () => {
        expect(getFlightPriceTolerance()).toBe(FLIGHT_PRICE_TOLERANCE_LIVE);
    });

    it('lets an override make a sandbox run behave like live', () => {
        process.env.DUFFEL_ACCESS_TOKEN = 'duffel_test_abc';
        process.env.FLIGHT_PRICE_TOLERANCE = '0.5';
        expect(getFlightPriceTolerance()).toBe(0.5);
    });

    it('accepts a zero override (reject any drift at all)', () => {
        process.env.DUFFEL_ACCESS_TOKEN = 'duffel_test_abc';
        process.env.FLIGHT_PRICE_TOLERANCE = '0';
        expect(getFlightPriceTolerance()).toBe(0);
    });

    it('ignores junk and negative overrides rather than disabling the gate', () => {
        process.env.DUFFEL_ACCESS_TOKEN = 'duffel_live_abc';
        for (const bad of ['', 'abc', '-1', 'NaN']) {
            process.env.FLIGHT_PRICE_TOLERANCE = bad;
            expect(getFlightPriceTolerance()).toBe(FLIGHT_PRICE_TOLERANCE_LIVE);
        }
    });

    it('reads the DUFFEL_TOKEN alias when the real name is absent', () => {
        process.env.DUFFEL_TOKEN = 'duffel_test_abc';
        expect(getFlightPriceTolerance()).toBe(FLIGHT_PRICE_TOLERANCE_SANDBOX);
    });
});
