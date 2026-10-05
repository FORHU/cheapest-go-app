import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/server/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ success: true })) }));
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

    it('returns the day\'s tee times', async () => {
        const res = await get('known', '?date=2026-10-12');
        expect(await res.json()).toEqual({ success: true, data: { timezone: 'Asia/Manila', teeTimes: [] } });
        expect(listAvailableTeeTimes).toHaveBeenCalledWith('known', '2026-10-12');
    });
});
