import { describe, it, expect, vi } from 'vitest';
import type { GolfBooking } from '@/lib/schemas/golf';

vi.mock('@/lib/server/email', () => ({
    FROM_NOREPLY: 'CheapestGo <no-reply@example.com>',
    logEmail: vi.fn(async () => ({ duplicate: false })),
}));
vi.mock('@/utils/env', () => ({ env: { RESEND_API_KEY: '' } }));

import { buildGolfBookingEmail, sendGolfBookingEmail } from './emails';
import { logEmail } from '@/lib/server/email';

const booking: GolfBooking = {
    id: 'b1', reference: 'CG-ABC234', userId: 'u1', courseId: 'c1', courseName: 'Wack <Wack>',
    courseSlug: 'wack-wack', timezone: 'Asia/Manila', teeTimeId: 't1', startsAt: '2026-10-09T23:38:00.000Z',
    players: 2, leadName: 'Ana & Co', contactEmail: 'ana@example.com', pricePerPlayer: 2500,
    greenFeeTotal: 5000, serviceFee: 318, total: 5318, currency: 'PHP', paymentIntentId: 'pi_1',
    status: 'requested', holdExpiresAt: '2026-10-06T10:15:00.000Z', requestedAt: '2026-10-06T10:05:00.000Z',
    decideBy: '2026-10-08T10:05:00.000Z', confirmedAt: null, closedAt: null, closeReason: null,
    refundAmount: 0, freeCancelUntil: '2026-10-07T23:38:00.000Z',
};

describe('buildGolfBookingEmail', () => {
    it('says a request is not charged yet, on the course clock, with everything escaped', () => {
        const { subject, html } = buildGolfBookingEmail('requested', booking);
        expect(subject).toBe('Tee time requested – Wack <Wack>');
        expect(html).toContain('Wack &lt;Wack&gt;');
        expect(html).toContain('Ana &amp; Co');
        expect(html).toContain('won&#39;t be charged');
        expect(html).toContain('10 Oct 2026');
        expect(html).toContain('07:38');
        expect(html).toContain('5,318.00');
        expect(html).toContain('/golf/bookings/CG-ABC234');
    });

    it('explains a decline that ran out of time', () => {
        const { html } = buildGolfBookingEmail('declined', { ...booking, status: 'declined', closeReason: 'not_confirmed_in_time' });
        expect(html).toContain('in time');
        expect(html).toContain('not charged');
    });

    it('states the refund on a cancellation, or that nothing was charged', () => {
        const refunded = buildGolfBookingEmail('cancelled', { ...booking, status: 'cancelled', refundAmount: 5318, closeReason: 'cancelled_by_customer' });
        expect(refunded.html).toContain('refunded');
        const free = buildGolfBookingEmail('cancelled', { ...booking, status: 'cancelled', refundAmount: 0, closeReason: 'cancelled_by_customer' });
        expect(free.html).toContain('You were not charged.');
    });

    it('promises free cancellation only while it is still open', () => {
        const early = buildGolfBookingEmail('confirmed', { ...booking, status: 'confirmed', confirmedAt: '2026-10-06T12:00:00.000Z' });
        expect(early.html).toContain('Free cancellation until');
        // Booked inside the course's window: the cutoff had passed before the team confirmed.
        const late = buildGolfBookingEmail('confirmed', { ...booking, status: 'confirmed', confirmedAt: '2026-10-08T00:00:00.000Z' });
        expect(late.html).toContain('Free cancellation ended on');
        expect(late.html).not.toContain('Free cancellation until');
    });
});

describe('sendGolfBookingEmail', () => {
    it('queues the email in email_logs when no provider key is set', async () => {
        await sendGolfBookingEmail('confirmed', { ...booking, status: 'confirmed' });
        expect(logEmail).toHaveBeenCalledWith(expect.objectContaining({
            bookingId: 'CG-ABC234', recipient: 'ana@example.com', emailType: 'golf_confirmed', status: 'queued',
        }));
    });
});
