import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/server/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/server/golf/quote', () => ({
    quoteGolf: vi.fn(async ({ greenFeeTotal }: { greenFeeTotal: number }) => ({ total: greenFeeTotal * 1.1 })),
}));
vi.mock('@/lib/server/golf/teeTimes', () => ({
    listAvailableTeeTimes: vi.fn(async (slug: string) => (slug === 'known' ? { timezone: 'Asia/Manila', teeTimes: [] } : null)),
}));

import { GET } from './route';
import { listAvailableTeeTimes } from '@/lib/server/golf/teeTimes';

const get = (slug: string, query: string) =>
    GET(new Request(`http://localhost/api/golf/courses/${slug}/tee-times${query}`) as never, { params: Promise.resolve({ slug }) });

describe('GET /api/golf/courses/[slug]/tee-times', () => {
    it('needs a real date', async () => {
        expect((await get('known', '?date=2026-02-30')).status).toBe(400);
        expect((await get('known', '')).status).toBe(400);
    });

    it('answers an unknown or unbookable course with 404', async () => {
        expect((await get('nowhere', '?date=2026-10-12')).status).toBe(404);
    });

    const oneTeeTime = {
        timezone: 'Asia/Manila',
        teeTimes: [{ id: 't1', startsAt: '2026-10-12T23:00:00.000Z', localTime: '07:00', spots: 4, spotsLeft: 4, pricePerPlayer: 100, currency: 'USD' }],
    };

    it('prices each tee time all-in for the party asked about', async () => {
        vi.mocked(listAvailableTeeTimes).mockResolvedValueOnce(oneTeeTime);
        const body = await (await get('known', '?date=2026-10-12&players=4')).json();
        expect(body.data.teeTimes[0]).toMatchObject({ pricePerPlayer: 100, allInPerPlayer: 110 });
    });

    it('falls back to two players when the party is nonsense', async () => {
        const { quoteGolf } = await import('@/lib/server/golf/quote');
        vi.mocked(listAvailableTeeTimes).mockResolvedValueOnce(oneTeeTime);
        await get('known', '?date=2026-10-12&players=nine');
        expect(quoteGolf).toHaveBeenLastCalledWith({ greenFeeTotal: 200, currency: 'USD' });
    });

    it('returns the day\'s tee times', async () => {
        const res = await get('known', '?date=2026-10-12');
        expect(await res.json()).toEqual({ success: true, data: { timezone: 'Asia/Manila', teeTimes: [] } });
        expect(listAvailableTeeTimes).toHaveBeenCalledWith('known', '2026-10-12');
    });
});
