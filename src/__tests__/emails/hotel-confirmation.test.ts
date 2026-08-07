import { describe, it, expect } from 'vitest';
import { buildHotelConfirmationHtml, type SendBookingEmailParams } from '@/lib/server/email';

const MINIMAL: SendBookingEmailParams = {
    bookingId: 'CG-502881196',
    email: 'traveller@example.com',
    guestName: 'R. Dimaculangan',
    hotelName: 'Hotel Celeste Makati',
    roomName: 'Deluxe King',
    checkIn: '2026-09-04',
    checkOut: '2026-09-05',
    totalPrice: 6757.6,
    currency: 'PHP',
};

const FULL: SendBookingEmailParams = {
    ...MINIMAL,
    dbId: 'a1b2c3',
    cityName: 'Makati',
    propertyImageUrl: 'https://cdn.example.com/celeste.jpg',
    propertyAddress: 'San Antonio, Makati, Metro Manila',
    propertyUrl: 'https://cheapestgo.com/hotels/hotel-celeste-makati',
    adults: 2,
    boardDescription: 'breakfast included',
    checkInTime: '15:00',
    checkOutTime: '12:00',
    nights: 1,
    roomSubtotal: 6480,
    taxesAndFees: 777.6,
    discountAmount: 500,
    paymentMethodLabel: 'Visa ending 4417',
    chargedAt: '2026-08-07',
    freeCancellationUntil: '2 Sep, 23:59',
};

describe('buildHotelConfirmationHtml', () => {
    it('always shows the reference and the total paid', () => {
        const html = buildHotelConfirmationHtml(MINIMAL);
        expect(html).toContain('CG-502881196');
        expect(html).toContain('Total paid');
        expect(html).toContain('6,757.60');
    });

    it('formats dates as the design specifies', () => {
        const html = buildHotelConfirmationHtml(MINIMAL);
        expect(html).toContain('Fri 4 Sep');
        expect(html).toContain('Sat 5 Sep');
    });

    it('falls back to a generic headline when no city is known', () => {
        expect(buildHotelConfirmationHtml(MINIMAL)).toContain('Your booking is confirmed');
        expect(buildHotelConfirmationHtml(FULL)).toContain('You&rsquo;re booked in Makati');
    });

    // ── Omission, not invention ──────────────────────────────────────
    // This is a record of a payment. A missing row is honest; a fabricated
    // tax line, card number or cancellation deadline is not.

    it('omits the price breakdown when the components are unknown', () => {
        const html = buildHotelConfirmationHtml(MINIMAL);
        expect(html).not.toContain('Taxes and fees');
        expect(html).not.toContain('credit');
        // …but the total is still stated.
        expect(html).toContain('Total paid');
    });

    it('omits the cancellation block when no deadline is known', () => {
        expect(buildHotelConfirmationHtml(MINIMAL)).not.toContain('Free cancellation');
        expect(buildHotelConfirmationHtml(FULL)).toContain('Free cancellation until 2 Sep, 23:59');
    });

    it('omits the payment method line when unknown', () => {
        expect(buildHotelConfirmationHtml(MINIMAL)).not.toContain('Visa ending');
        expect(buildHotelConfirmationHtml(FULL)).toContain('Visa ending 4417');
    });

    it('omits the property image and directions when not supplied', () => {
        const html = buildHotelConfirmationHtml(MINIMAL);
        expect(html).not.toContain('<img');
        expect(html).not.toContain('Directions');
    });

    it('renders the full breakdown when every component is supplied', () => {
        const html = buildHotelConfirmationHtml(FULL);
        expect(html).toContain('1 room &times; 1 night');
        expect(html).toContain('Taxes and fees');
        expect(html).toContain('6,480.00');
        expect(html).toContain('777.60');
        expect(html).toContain('500.00');
        expect(html).toContain('breakfast included');
        expect(html).toContain('2 guests');
    });

    // ── Escaping ─────────────────────────────────────────────────────
    // Property and room names come from suppliers, not from us.

    it('escapes supplier-controlled strings', () => {
        const html = buildHotelConfirmationHtml({
            ...MINIMAL,
            hotelName: '<script>alert(1)</script>Evil & Co "Hotel"',
            roomName: "Suite <img src=x onerror=alert(1)>",
        });
        // The payload must not survive as MARKUP. It may well survive as visible
        // text — "onerror=" inside &lt;…&gt; is inert, so asserting on the substring
        // alone would be testing the wrong thing.
        expect(html).not.toContain('<script>');
        expect(html).not.toContain('<img src=x');
        expect(html).toContain('&lt;script&gt;');
        expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
        expect(html).toContain('Evil &amp; Co');
    });

    it('escapes an attacker-supplied image URL into the src attribute safely', () => {
        const html = buildHotelConfirmationHtml({
            ...MINIMAL,
            propertyImageUrl: 'https://x/y.jpg" onerror="alert(1)',
        });
        expect(html).not.toContain('onerror="alert(1)"');
        expect(html).toContain('&quot;');
    });

    // ── Email-client safety ──────────────────────────────────────────

    it('is table-based with no flexbox or grid, which Outlook cannot render', () => {
        const html = buildHotelConfirmationHtml(FULL);
        expect(html).not.toContain('display:flex');
        expect(html).not.toContain('display:grid');
        expect(html).toContain('role="presentation"');
    });

    it('includes a preheader so the inbox preview is not the raw markup', () => {
        const html = buildHotelConfirmationHtml(MINIMAL);
        expect(html).toContain('Hotel Celeste Makati');
        expect(html).toMatch(/display:none;font-size:1px/);
    });

    it('produces balanced table markup', () => {
        const html = buildHotelConfirmationHtml(FULL);
        const open = (html.match(/<table/g) ?? []).length;
        const close = (html.match(/<\/table>/g) ?? []).length;
        expect(open).toBe(close);
    });
});
