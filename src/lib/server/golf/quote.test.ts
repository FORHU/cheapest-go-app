import { describe, it, expect, vi } from 'vitest';

// Rates as "USD per 1 unit", the shape lib/currency holds, so the tests do not need a network.
const RATES: Record<string, number> = { USD: 1, PHP: 0.0175, KRW: 0.0007, THB: 0.03 };
vi.mock('@/lib/currency', () => ({
    refreshExchangeRates: vi.fn(async () => true),
    convertCurrencyStrict: (amount: number, from: string, to: string) => {
        if (from === to) return amount;
        if (!RATES[from] || !RATES[to]) throw new Error(`No exchange rate for ${from} or ${to}`);
        return (amount * RATES[from]) / RATES[to];
    },
}));

import { golfServiceFee } from '@/lib/pricing';
import { quoteGolf } from './quote';

const convert = (amount: number, from: string, to: string) => (from === to ? amount : (amount * RATES[from]) / RATES[to]);

describe('quoteGolf', () => {
    it('is unchanged when the charge currency is the course currency', async () => {
        const q = await quoteGolf({ greenFeeTotal: 200, currency: 'USD' });
        const fee = golfServiceFee(200, 'USD', convert);
        expect(q).toMatchObject({ currency: 'USD', rate: 1, greenFee: 200, extras: 0, base: 200, total: Math.round(fee.chargedTotal * 100) / 100 });
        expect(q.serviceFee).toBeCloseTo(q.total - 200, 2);
    });

    it('converts the course price into the charge currency and puts the fee on that', async () => {
        // A THB course (the course is paid in baht) charged to a customer in USD.
        const q = await quoteGolf({ greenFeeTotal: 10_000, currency: 'THB', chargeCurrency: 'USD' });
        expect(q.currency).toBe('USD');
        expect(q.greenFee).toBe(300);
        const fee = golfServiceFee(300, 'USD', convert);
        expect(q.total).toBe(Math.round(fee.chargedTotal * 100) / 100);
        expect(q.rate).toBeCloseTo(0.03, 6);
    });

    it('rounds a Korean-won quote to whole won, and its parts add up to its total', async () => {
        const q = await quoteGolf({ greenFeeTotal: 123.45, extraLines: [33.33, 11.11], currency: 'USD', chargeCurrency: 'KRW' });
        for (const n of [q.greenFee, ...q.extraLines, q.extras, q.base, q.serviceFee, q.total]) {
            expect(Number.isInteger(n)).toBe(true);
        }
        expect(q.greenFee + q.extras).toBe(q.base);
        expect(q.base + q.serviceFee).toBe(q.total);
        expect(q.extras).toBe(q.extraLines.reduce((a, b) => a + b, 0));
    });

    it('charges extras as the sum of lines converted one by one', async () => {
        const q = await quoteGolf({ greenFeeTotal: 100, extraLines: [25, 25, 10], currency: 'USD', chargeCurrency: 'PHP' });
        expect(q.extraLines).toHaveLength(3);
        expect(q.extras).toBeCloseTo(q.extraLines.reduce((a, b) => a + b, 0), 2);
        expect(q.base).toBeCloseTo(q.greenFee + q.extras, 2);
    });

    it('prices a party the same way search and checkout do: from the course price, per party', async () => {
        const two = await quoteGolf({ greenFeeTotal: 200, currency: 'USD', chargeCurrency: 'PHP' });
        const four = await quoteGolf({ greenFeeTotal: 400, currency: 'USD', chargeCurrency: 'PHP' });
        // The flat part of the fee is spread over more players, so a bigger party is cheaper each.
        expect(four.total / 4).toBeLessThan(two.total / 2);
    });

    it('refuses to quote a currency it holds no rate for', async () => {
        await expect(quoteGolf({ greenFeeTotal: 100, currency: 'XYZ', chargeCurrency: 'USD' })).rejects.toThrow(/No exchange rate/);
        await expect(quoteGolf({ greenFeeTotal: 100, currency: 'USD', chargeCurrency: 'XYZ' })).rejects.toThrow(/No exchange rate/);
    });
});
