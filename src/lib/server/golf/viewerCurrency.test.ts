import { describe, it, expect, vi, beforeEach } from 'vitest';

const jar = vi.hoisted(() => ({ values: {} as Record<string, string> }));
vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({ get: (name: string) => (jar.values[name] ? { name, value: jar.values[name] } : undefined) })),
}));

const RATES: Record<string, number> = { USD: 1, PHP: 0.0175, KRW: 0.0007, THB: 0.03 };
vi.mock('@/lib/currency', () => ({
    refreshExchangeRates: vi.fn(async () => true),
    convertCurrencyStrict: (amount: number, from: string, to: string) => {
        if (from === to) return amount;
        if (!RATES[from] || !RATES[to]) throw new Error(`No exchange rate for ${from} or ${to}`);
        return (amount * RATES[from]) / RATES[to];
    },
}));

import type { GolfCourse } from '@/lib/schemas/golf';
import { courseInCurrency, viewerCurrency } from './viewerCurrency';

const course = (over: Partial<GolfCourse> = {}) =>
    ({ id: 'c1', name: 'Mine', currency: 'USD', greenFeeFrom: 100, ...over }) as GolfCourse;

beforeEach(() => { jar.values = {}; });

describe('viewerCurrency', () => {
    it('is the URL\'s currency first, then the cookie\'s, else null', async () => {
        jar.values.cg_currency = 'KRW';
        expect(await viewerCurrency('php')).toBe('PHP');
        expect(await viewerCurrency(undefined)).toBe('KRW');
        jar.values = {};
        expect(await viewerCurrency(undefined)).toBeNull();
    });

    it('never trusts a value that is not a charge currency', async () => {
        jar.values.cg_currency = 'DROP TABLE';
        expect(await viewerCurrency('ZZZ')).toBeNull();
    });
});

describe('courseInCurrency', () => {
    it('converts the indicative "from" price for display', async () => {
        const shown = await courseInCurrency(course(), 'PHP');
        expect(shown.currency).toBe('PHP');
        expect(shown.greenFeeFrom).toBe(5714.29);
    });

    it('rounds to whole won', async () => {
        const shown = await courseInCurrency(course({ greenFeeFrom: 100.5 }), 'KRW');
        expect(shown.currency).toBe('KRW');
        expect(Number.isInteger(shown.greenFeeFrom)).toBe(true);
    });

    it('leaves the course as it is when it has no price, or is already in that currency', async () => {
        const none = course({ greenFeeFrom: null });
        expect(await courseInCurrency(none, 'PHP')).toBe(none);
        const same = course({ currency: 'PHP' });
        expect(await courseInCurrency(same, 'PHP')).toBe(same);
    });

    it('falls back to the course\'s own figure when it cannot be converted', async () => {
        const odd = course({ currency: 'XYZ' });
        expect(await courseInCurrency(odd, 'PHP')).toBe(odd);
    });
});
