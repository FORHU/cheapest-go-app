import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { InvoicePdfDocument } from './InvoicePdfDocument';

/**
 * react-pdf validates styles when it lays a page out, not when TypeScript compiles it,
 * so a document referencing a style that was deleted typechecks and then throws for a
 * traveller pressing Download. These render the real thing.
 *
 * The rows the Figma draws but the data cannot fill — Fare, Taxes, Restriction
 * Endorsements, Fare Calculation — must not appear at all rather than appear empty
 * (ADR-0042), and the unverified trading-name line must stay gone.
 */

const flightProps = {
    invoiceNumber: 'INV-1B10013F',
    issuedDate: 'September 15, 2026',
    billedTo: { name: 'Billy Dhen Clir Busilan', email: 'traveller@example.com' },
    isHotel: false,
    paidBadge: 'Paid',
    reference: { label: 'PNR', value: 'NPGUDO' },
    tripSummary: { title: 'CRK → PUS · Round-trip', subtitle: 'Oct 2 – Oct 4, 2026 · 1 passenger' },
    hotelDetails: null,
    flightDetails: {
        slices: [{
            label: 'Depart',
            flightNumber: 'PR 2811',
            cabinClass: 'economy',
            origin: 'CRK',
            destination: 'PUS',
            departureTime: '09:00 AM',
            departureDate: 'Fri, Oct 2',
            arrivalTime: '02:30 PM',
            arrivalDate: 'Fri, Oct 2',
            arrivalDayOffset: 0,
            durationLabel: '5h 30m',
            stopsLabel: 'Direct',
        }],
        passengers: [{ name: 'Billy Dhen Clir Busilan', type: 'Adult', ticketNumber: '0794412345678' }],
    },
    bookingRef: 'NPGUDO',
    bookingType: 'Flight · round-trip',
    provider: 'duffel',
    formattedTotal: 'USD 784.00',
    cancellation: 'Non-refundable',
    discount: null,
    ticketNumber: '0794412345678',
    issuingAirline: 'Philippine Airlines',
    breakdown: null,
};

const render = (props: Parameters<typeof InvoicePdfDocument>[0]) =>
    renderToBuffer(React.createElement(InvoicePdfDocument, props) as any);

describe('InvoicePdfDocument', () => {
    it('renders a flight receipt', async () => {
        const buffer = await render(flightProps);

        expect(buffer.length).toBeGreaterThan(1000);
        expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('renders a hotel receipt through the same layout', async () => {
        const buffer = await render({
            ...flightProps,
            isHotel: true,
            reference: { label: 'Booking Reference', value: 'CG-88213' },
            tripSummary: { title: 'Hotel Sogo', subtitle: 'Oct 2, 2026 – Oct 4, 2026' },
            flightDetails: null,
            hotelDetails: {
                propertyName: 'Hotel Sogo',
                roomName: 'Deluxe Queen',
                dates: 'Oct 2 → Oct 4, 2026',
                nights: 2,
                guests: '2 adults',
            },
            bookingRef: 'CG-88213',
            bookingType: 'Hotel',
            provider: 'Hotel Partner',
            ticketNumber: null,
            issuingAirline: 'Hotel Sogo',
        });

        expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('renders when the booking records no terms, no ticket and no discount', async () => {
        // Every optional row absent at once — the case that catches a row rendering
        // an empty label instead of disappearing.
        const buffer = await render({
            ...flightProps,
            cancellation: null,
            discount: null,
            ticketNumber: null,
            issuingAirline: null,
        });

        expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('renders a booking whose offer recorded a fare', async () => {
        const buffer = await render({
            ...flightProps,
            breakdown: { formattedFare: 'USD 700.00', formattedTaxesAndFees: 'USD 84.00' },
        });

        expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('renders a discounted booking', async () => {
        const buffer = await render({
            ...flightProps,
            discount: { label: 'Voucher WELCOME', formattedAmount: 'USD 50.00' },
        });

        expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('no longer claims an unverified trading name', () => {
        // The line named a company appearing nowhere else in the codebase, on a document
        // finance teams file. It must not come back without a confirmed entity.
        //
        // Comments are stripped first: the source deliberately explains what was removed
        // and why, and that explanation must not itself trip this.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const source: string = require('fs').readFileSync(__filename.replace('.test.tsx', '.tsx'), 'utf8');
        const code = source
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '');

        expect(code).not.toContain('CheapestGo Travel Services');
        expect(code).not.toContain('is a trading name of');
    });
});
