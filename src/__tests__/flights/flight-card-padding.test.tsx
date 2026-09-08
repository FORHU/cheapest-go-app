import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/locales/en.json';

/**
 * Nothing in the card sits closer than 16px to its edge, and 24px at desktop width.
 *
 * The padding is spread over several blocks — the summary, the expand toggle, the
 * itinerary, the fare rail — because the card's dividers run edge to edge and would be
 * inset if one container held it all. So these measure what actually matters: the total
 * inset of a piece of content from the card edge, summed over every ancestor that pads
 * it. Where the padding lives is then free to change; how far the content sits in is not.
 */

vi.mock('framer-motion', () => ({
    motion: new Proxy({}, { get: () => (p: any) => React.createElement('div', null, p.children) }),
    AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
}));
vi.mock('@/stores/searchStore', () => ({ useUserCurrency: () => 'USD' }));
vi.mock('@/components/common/SaveButton', () => ({ default: () => null }));

import { FlightCard } from '@/components/flights/flightCard';
import type { FlightOffer, FlightSegmentDetail } from '@/types/flights';

const MIN_PADDING_PX = 16;
/** Desktop gets more room again: the card's content is held 24px in. */
const MIN_DESKTOP_PADDING_PX = 24;

type Sides = { top: number; right: number; bottom: number; left: number };

/** Tailwind's spacing scale is quarter-rem: `p-3` is 12px, `py-2.5` is 10px. */
function spacingToPx(token: string): number | null {
    const n = Number(token);
    return Number.isFinite(n) ? n * 4 : null;
}

/**
 * The padding one element declares at a given width.
 *
 * Base utilities are applied first, then the breakpoint's, mirroring how the cascade
 * resolves them — so `p-3 lg:p-5` is 12px narrow and 20px wide.
 */
function declaredPadding(className: string, breakpoint?: 'lg'): Sides {
    const sides: Sides = { top: 0, right: 0, bottom: 0, left: 0 };
    const prefixes = breakpoint ? ['', `${breakpoint}:`] : [''];

    for (const prefix of prefixes) {
        for (const cls of className.split(/\s+/)) {
            if (!cls.startsWith(prefix)) continue;
            const bare = cls.slice(prefix.length);
            if (bare.includes(':')) continue;
            const match = /^p([xytrbl]?)-(.+)$/.exec(bare);
            if (!match) continue;
            const px = spacingToPx(match[2]);
            if (px === null) continue;

            const [, axis] = match;
            if (axis === '') Object.assign(sides, { top: px, right: px, bottom: px, left: px });
            else if (axis === 'x') Object.assign(sides, { left: px, right: px });
            else if (axis === 'y') Object.assign(sides, { top: px, bottom: px });
            else if (axis === 't') sides.top = px;
            else if (axis === 'r') sides.right = px;
            else if (axis === 'b') sides.bottom = px;
            else if (axis === 'l') sides.left = px;
        }
    }

    return sides;
}

/** How far this element's box sits inside the card, summed over everything that pads it. */
function insetFromCard(el: Element, card: Element, breakpoint?: 'lg'): Sides {
    const total: Sides = { top: 0, right: 0, bottom: 0, left: 0 };

    for (let node = el.parentElement; node && node !== card.parentElement; node = node.parentElement) {
        const own = declaredPadding(node.className ?? '', breakpoint);
        total.top += own.top;
        total.right += own.right;
        total.bottom += own.bottom;
        total.left += own.left;
    }

    return total;
}

function renderIntl(ui: React.ReactElement) {
    return render(
        <NextIntlClientProvider locale="en" messages={en as never} timeZone="UTC">
            {ui}
        </NextIntlClientProvider>,
    );
}

function seg(
    sliceIndex: number,
    from: string,
    to: string,
    departure: string,
    arrival: string,
    overrides: Partial<FlightSegmentDetail> = {},
): FlightSegmentDetail {
    return {
        segmentIndex: sliceIndex,
        airline: { code: 'QR', name: 'Qatar Airways' },
        origin: from,
        destination: to,
        flightNumber: `QR${from}`,
        departure: { airport: from, time: departure },
        arrival: { airport: to, time: arrival },
        duration: 0,
        stops: 0,
        cabinClass: 'economy',
        ...overrides,
    };
}

const offer = {
    offerId: 'off_1',
    provider: 'duffel',
    price: { total: 1039, base: 900, taxes: 139, currency: 'USD', pricePerAdult: 1039 },
    segments: [
        seg(0, 'CRK', 'DOH', '2026-09-23T18:40:00', '2026-09-23T22:30:00', { duration: 530, flightNumber: 'QR0927' }),
        seg(0, 'DOH', 'LHR', '2026-09-24T01:15:00', '2026-09-24T06:30:00', { duration: 470, flightNumber: 'QR0103' }),
    ],
    sliceDurations: [1550],
    totalDuration: 1550,
    totalStops: 1,
    refundable: false,
    baggage: { carryOnBags: 1, checkedBags: 1 },
    tripType: 'one-way',
} as FlightOffer;

describe('FlightCard — the card is padded', () => {
    it('holds the airline block a clear 16px inside the card', () => {
        const { container } = renderIntl(<FlightCard offer={offer} />);
        const card = container.firstElementChild!;

        const inset = insetFromCard(screen.getByText('Qatar Airways'), card);

        expect(inset.left).toBeGreaterThanOrEqual(MIN_PADDING_PX);
        expect(inset.right).toBeGreaterThanOrEqual(MIN_PADDING_PX);
        expect(inset.top).toBeGreaterThanOrEqual(MIN_PADDING_PX);
    });

    it('holds the expand toggle a clear 16px off the foot of a collapsed card', () => {
        const { container } = renderIntl(<FlightCard offer={offer} />);
        const card = container.firstElementChild!;

        // Collapsed, this is the last thing in the card — its bottom is the card's.
        // The toggle spans the column, so its own padding is what insets its label.
        const toggle = screen.getByText('Show all segments');
        const inset = insetFromCard(toggle, card);
        const own = declaredPadding(toggle.className);

        expect(inset.left + own.left).toBeGreaterThanOrEqual(MIN_PADDING_PX);
        expect(inset.bottom + own.bottom).toBeGreaterThanOrEqual(MIN_PADDING_PX);
    });

    it('holds the fare rail a clear 16px inside the card', () => {
        const { container } = renderIntl(<FlightCard offer={offer} />);
        const card = container.firstElementChild!;

        const inset = insetFromCard(screen.getByRole('button', { name: 'Select' }), card);

        expect(inset.top).toBeGreaterThanOrEqual(MIN_PADDING_PX);
        expect(inset.right).toBeGreaterThanOrEqual(MIN_PADDING_PX);
        expect(inset.bottom).toBeGreaterThanOrEqual(MIN_PADDING_PX);
    });

    it('holds the fare a clear 16px inside the card', () => {
        const { container } = renderIntl(<FlightCard offer={offer} />);
        const card = container.firstElementChild!;

        const inset = insetFromCard(screen.getByText('$1,039.00'), card);

        expect(inset.top).toBeGreaterThanOrEqual(MIN_PADDING_PX);
        expect(inset.right).toBeGreaterThanOrEqual(MIN_PADDING_PX);
    });

    it('holds the expanded itinerary a clear 16px inside the card', () => {
        const { container } = renderIntl(<FlightCard offer={offer} />);
        const card = container.firstElementChild!;

        fireEvent.click(screen.getByText('Show all segments'));
        const inset = insetFromCard(screen.getAllByText('Depart from')[0], card);

        expect(inset.left).toBeGreaterThanOrEqual(MIN_PADDING_PX);
        expect(inset.right).toBeGreaterThanOrEqual(MIN_PADDING_PX);
        expect(inset.top).toBeGreaterThanOrEqual(MIN_PADDING_PX);
    });

    it('holds the last leg a clear 16px off the foot of an expanded card', () => {
        const { container } = renderIntl(<FlightCard offer={offer} />);
        const card = container.firstElementChild!;

        fireEvent.click(screen.getByText('Show all segments'));
        const arrivals = screen.getAllByText('Arrive at');
        const inset = insetFromCard(arrivals[arrivals.length - 1], card);

        expect(inset.bottom).toBeGreaterThanOrEqual(MIN_PADDING_PX);
    });

    it('opens the card up to 24px at desktop width, as the design draws it', () => {
        const { container } = renderIntl(<FlightCard offer={offer} />);
        const card = container.firstElementChild!;

        const summary = insetFromCard(screen.getByText('Qatar Airways'), card, 'lg');
        const rail = insetFromCard(screen.getByRole('button', { name: 'Select' }), card, 'lg');

        expect(summary.left).toBeGreaterThanOrEqual(MIN_DESKTOP_PADDING_PX);
        expect(summary.top).toBeGreaterThanOrEqual(MIN_DESKTOP_PADDING_PX);
        expect(rail.right).toBeGreaterThanOrEqual(MIN_DESKTOP_PADDING_PX);
        expect(rail.bottom).toBeGreaterThanOrEqual(MIN_DESKTOP_PADDING_PX);
    });

    it('opens the expanded itinerary up to 24px at desktop width', () => {
        const { container } = renderIntl(<FlightCard offer={offer} />);
        const card = container.firstElementChild!;

        fireEvent.click(screen.getByText('Show all segments'));
        const inset = insetFromCard(screen.getAllByText('Depart from')[0], card, 'lg');

        expect(inset.left).toBeGreaterThanOrEqual(MIN_DESKTOP_PADDING_PX);
        expect(inset.top).toBeGreaterThanOrEqual(MIN_DESKTOP_PADDING_PX);
        expect(inset.bottom).toBeGreaterThanOrEqual(MIN_DESKTOP_PADDING_PX);
    });
});
