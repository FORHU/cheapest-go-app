import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/locales/en.json';

/**
 * "Show all segments" used to reveal the itinerary by growing the panel's height alone,
 * which reads as the card stretching rather than the itinerary arriving. The legs slide
 * down into the space as it opens.
 *
 * framer-motion is stood in for by a recorder rather than the usual prop-dropping stub:
 * the motion declaration IS the behaviour under test, and a stub that discards it would
 * let this file pass against a card that animates nothing.
 */
vi.mock('framer-motion', () => ({
    motion: new Proxy(
        {},
        {
            get: () => (p: any) =>
                React.createElement(
                    'div',
                    {
                        className: p.className,
                        'data-initial': JSON.stringify(p.initial ?? null),
                        'data-animate': JSON.stringify(p.animate ?? null),
                        'data-exit': JSON.stringify(p.exit ?? null),
                    },
                    p.children,
                ),
        },
    ),
    AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
}));
vi.mock('@/stores/searchStore', () => ({ useUserCurrency: () => 'USD' }));
vi.mock('@/components/common/SaveButton', () => ({ default: () => null }));

import { FlightCard } from '@/components/flights/flightCard';
import type { FlightOffer, FlightSegmentDetail } from '@/types/flights';

function renderIntl(ui: React.ReactElement) {
    return render(
        <NextIntlClientProvider locale="en" messages={en as never} timeZone="UTC">
            {ui}
        </NextIntlClientProvider>,
    );
}

function seg(from: string, to: string, dep: string, arr: string): FlightSegmentDetail {
    return {
        segmentIndex: 0,
        airline: { code: 'QR', name: 'Qatar Airways' },
        origin: from,
        destination: to,
        flightNumber: `QR${from}${to}`,
        departure: { airport: from, time: dep },
        arrival: { airport: to, time: arr },
        duration: 0,
        stops: 0,
        cabinClass: 'economy',
    };
}

const offer = {
    offerId: 'off_1',
    provider: 'duffel',
    price: { total: 1372.7, base: 1200, taxes: 172.7, currency: 'USD', pricePerAdult: 1373 },
    segments: [
        seg('CRK', 'DOH', '2026-09-23T18:40:00', '2026-09-23T22:30:00'),
        seg('DOH', 'LHR', '2026-09-24T01:15:00', '2026-09-24T06:30:00'),
    ],
    sliceDurations: [1130],
    totalDuration: 1130,
    totalStops: 1,
    refundable: false,
    baggage: { carryOnBags: 1, checkedBags: 1 },
    tripType: 'one-way',
} as FlightOffer;

const parse = (el: Element, name: string) => JSON.parse(el.getAttribute(name) || 'null');

/** The panel AnimatePresence mounts for the expanded itinerary. */
function revealPanel(container: HTMLElement) {
    return Array.from(container.querySelectorAll('[data-animate]')).find(
        el => parse(el, 'data-animate')?.height === 'auto',
    );
}

/**
 * An element that travels vertically into place. Searched from inside the panel, never
 * from the card root — the row itself already fades up on mount, and matching that
 * would pass with no slide on the itinerary at all.
 */
function sliderWithin(panel: Element) {
    return Array.from(panel.querySelectorAll('[data-initial]')).find(el => {
        const from = parse(el, 'data-initial');
        const to = parse(el, 'data-animate');
        return typeof from?.y === 'number' && from.y !== 0 && to?.y === 0;
    });
}

describe('FlightCard — opening "Show all segments"', () => {
    it('reveals nothing until the toggle is pressed', () => {
        const { container } = renderIntl(<FlightCard offer={offer} />);

        expect(revealPanel(container)).toBeUndefined();
    });

    it('slides the itinerary down as the panel opens', () => {
        const { container } = renderIntl(<FlightCard offer={offer} />);

        fireEvent.click(screen.getByText('Show all segments'));
        const panel = revealPanel(container)!;

        expect(panel).toBeTruthy();
        expect(sliderWithin(panel)).toBeTruthy();
    });

    it('slides from above, so the legs arrive into the space the panel opens', () => {
        const { container } = renderIntl(<FlightCard offer={offer} />);

        fireEvent.click(screen.getByText('Show all segments'));
        const from = parse(sliderWithin(revealPanel(container)!)!, 'data-initial');

        expect(from.y).toBeLessThan(0);
    });

    it('carries the itinerary itself, not some empty wrapper beside it', () => {
        const { container } = renderIntl(<FlightCard offer={offer} />);

        fireEvent.click(screen.getByText('Show all segments'));
        const slider = sliderWithin(revealPanel(container)!)!;

        expect(slider.textContent).toContain('Depart from');
    });

    it('still keeps the panel clipped while it grows', () => {
        // The height animation is what makes the card reflow smoothly; the slide rides
        // on top of it and must not replace it.
        const { container } = renderIntl(<FlightCard offer={offer} />);

        fireEvent.click(screen.getByText('Show all segments'));
        const panel = revealPanel(container)!;

        expect(panel.className).toContain('overflow-hidden');
        expect(parse(panel, 'data-initial').height).toBe(0);
    });
});
