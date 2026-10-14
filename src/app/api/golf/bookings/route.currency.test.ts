import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server/auth', () => ({
    getAuthenticatedUser: vi.fn(async () => ({ user: { id: 'user-1', email: 'ana@example.com' } })),
}));
vi.mock('@/lib/server/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/server/golf/bookings', () => ({ holdTeeTime: vi.fn() }));

import { POST } from './route';
import { holdTeeTime } from '@/lib/server/golf/bookings';
import { GolfBookingError } from '@/lib/server/golf/errors';
import { ExchangeRateError } from '@/lib/currency';

const teeTimeId = '6f1c2e0a-9b7d-4c1e-a2f5-3d8e1b0c7a44';
const post = (body: unknown) =>
    POST(new Request('http://localhost/api/golf/bookings', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
        body: JSON.stringify(body),
    }) as never);

const held = {
    booking: { reference: 'CG-1', holdExpiresAt: 'x', greenFeeTotal: 11428.57, serviceFee: 900, total: 12328.57, currency: 'PHP' },
    clientSecret: 'secret',
};

beforeEach(() => vi.clearAllMocks());

describe('POST /api/golf/bookings', () => {
    it('passes the customer\'s charge currency and the total they were shown to the hold', async () => {
        vi.mocked(holdTeeTime).mockResolvedValueOnce(held as never);
        const res = await post({ teeTimeId, players: 2, leadName: 'Ana', chargeCurrency: 'php', displayedTotal: 12328.57 });
        expect(res.status).toBe(201);
        expect(holdTeeTime).toHaveBeenCalledWith(expect.objectContaining({
            userId: 'user-1', teeTimeId, players: 2, chargeCurrency: 'PHP', displayedTotal: 12328.57,
        }));
        expect((await res.json()).data).toMatchObject({ currency: 'PHP', total: 12328.57 });
    });

    it('still holds without them, as before customers could choose', async () => {
        vi.mocked(holdTeeTime).mockResolvedValueOnce(held as never);
        expect((await post({ teeTimeId, players: 2, leadName: 'Ana' })).status).toBe(201);
        const [input] = vi.mocked(holdTeeTime).mock.calls[0];
        expect(input.chargeCurrency).toBeUndefined();
    });

    it('relays the new price when it has moved, so the page can show it', async () => {
        vi.mocked(holdTeeTime).mockRejectedValueOnce(
            new GolfBookingError('price_changed', 'The price has changed.', { serverPrice: 12500, currency: 'PHP' }),
        );
        const res = await post({ teeTimeId, players: 2, leadName: 'Ana', chargeCurrency: 'PHP', displayedTotal: 11000 });
        expect(res.status).toBe(409);
        expect(await res.json()).toMatchObject({ code: 'price_changed', serverPrice: 12500, currency: 'PHP' });
    });

    it('says prices are unavailable, not that the server broke, when no rate can be had', async () => {
        vi.mocked(holdTeeTime).mockRejectedValueOnce(new ExchangeRateError('Exchange rates are 30h old'));
        const res = await post({ teeTimeId, players: 2, leadName: 'Ana', chargeCurrency: 'KRW' });
        expect(res.status).toBe(503);
        expect(await res.json()).toMatchObject({ code: 'rates_unavailable' });
    });

    it('refuses a malformed currency or total before touching a hold', async () => {
        expect((await post({ teeTimeId, players: 2, leadName: 'Ana', chargeCurrency: 'PESOS' })).status).toBe(400);
        expect((await post({ teeTimeId, players: 2, leadName: 'Ana', displayedTotal: -5 })).status).toBe(400);
        expect(holdTeeTime).not.toHaveBeenCalled();
    });
});
