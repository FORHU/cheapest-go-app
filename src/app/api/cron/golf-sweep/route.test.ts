import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server/golf/bookings', () => ({
    sweepGolfBookings: vi.fn(async () => ({ requested: 0, expired: 2, declined: 1, failed: 0 })),
}));
vi.mock('@/lib/server/golf/teeTimes', () => ({ generateTeeTimes: vi.fn(async () => 120) }));

import { GET as sweep } from './route';
import { GET as generate } from '../golf-generate-tee-times/route';

const call = (handler: typeof sweep, secret?: string) =>
    handler(new Request('http://localhost/api/cron/x', { headers: secret ? { authorization: `Bearer ${secret}` } : {} }) as never);

beforeEach(() => { process.env.CRON_SECRET = 'cron-secret'; });

describe('golf crons', () => {
    it('refuse a caller without the cron secret', async () => {
        expect((await call(sweep)).status).toBe(401);
        expect((await call(generate, 'wrong')).status).toBe(401);
    });

    it('sweep bookings and report the counts', async () => {
        expect(await (await call(sweep, 'cron-secret')).json()).toEqual({ success: true, requested: 0, expired: 2, declined: 1, failed: 0 });
    });

    it('generate tee times and report how many', async () => {
        expect(await (await call(generate, 'cron-secret')).json()).toEqual({ success: true, created: 120 });
    });
});
