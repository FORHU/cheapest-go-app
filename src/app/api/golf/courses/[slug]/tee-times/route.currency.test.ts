import { describe, it, expect, vi, beforeEach } from 'vitest';

const RATES: Record<string, number> = { USD: 1, PHP: 0.0175, KRW: 0.0007 };
vi.mock('@/lib/currency', () => ({
    refreshExchangeRates: vi.fn(async () => true),
    convertCurrencyStrict: (amount: number, from: string, to: string) => {
        if (from === to) return amount;
        if (!RATES[from] || !RATES[to]) throw new Error(`No exchange rate for ${from} or ${to}`);
        return (amount * RATES[from]) / RATES[to];
    },
}));
vi.mock('@/lib/server/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/server/golf/teeTimes', () => ({ listAvailableTeeTimes: vi.fn() }));

import { GET } from './route';
import { listAvailableTeeTimes } from '@/lib/server/golf/teeTimes';
import { quoteGolf } from '@/lib/server/golf/quote';

const teeTime = (currency: string, price = 100) => ({
    id: 't1', startsAt: '2030-01-08T00:00:00.000Z', localTime: '08:00', spots: 4, spotsLeft: 4, pricePerPlayer: price, currency,
});
const call = (query: string) =>
    GET(new Request(`http://localhost/api/golf/courses/mine/tee-times?date=2030-01-08${query}`) as never, {
        params: Promise.resolve({ slug: 'mine' }),
    });

beforeEach(() => vi.clearAllMocks());

describe('GET /api/golf/courses/[slug]/tee-times', () => {
    it('quotes in the course currency when the viewer has not chosen one', async () => {
        vi.mocked(listAvailableTeeTimes).mockResolvedValueOnce({ timezone: 'Asia/Manila', teeTimes: [teeTime('PHP', 5000)] } as never);
        const { data } = await (await call('&players=2')).json();
        const quote = await quoteGolf({ greenFeeTotal: 10000, currency: 'PHP' });
        expect(data.teeTimes[0]).toMatchObject({ allInPerPlayer: Math.round((quote.total / 2) * 100) / 100, allInCurrency: 'PHP' });
    });

    it('quotes in the currency asked for, the figure checkout would charge', async () => {
        vi.mocked(listAvailableTeeTimes).mockResolvedValueOnce({ timezone: 'Asia/Manila', teeTimes: [teeTime('USD', 100)] } as never);
        const { data } = await (await call('&players=2&currency=php')).json();
        const quote = await quoteGolf({ greenFeeTotal: 200, currency: 'USD', chargeCurrency: 'PHP' });
        expect(data.teeTimes[0]).toMatchObject({
            allInPerPlayer: Math.round((quote.total / 2) * 100) / 100, allInCurrency: 'PHP',
            // The course's own price is still the course's.
            pricePerPlayer: 100, currency: 'USD',
        });
    });

    it('ignores a currency customers are not charged in', async () => {
        vi.mocked(listAvailableTeeTimes).mockResolvedValueOnce({ timezone: 'Asia/Manila', teeTimes: [teeTime('USD')] } as never);
        const { data } = await (await call('&currency=THB')).json();
        expect(data.teeTimes[0].allInCurrency).toBe('USD');
    });

    it('leaves a tee time without an all-in figure when it cannot be priced', async () => {
        vi.mocked(listAvailableTeeTimes).mockResolvedValueOnce({ timezone: 'Asia/Manila', teeTimes: [teeTime('XYZ')] } as never);
        const { data } = await (await call('&currency=PHP')).json();
        expect(data.teeTimes[0].allInPerPlayer).toBeUndefined();
        expect(data.teeTimes[0].allInCurrency).toBeUndefined();
    });
});
