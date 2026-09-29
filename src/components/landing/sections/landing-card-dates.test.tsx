/**
 * What a landing card asks the search page for.
 *
 * Both sections used to send `checkIn = today, checkOut = tomorrow`. OTV holds near-zero
 * inventory in that window, so clicking Paris returned hundreds of hotels and not one
 * bookable room — the failure looked like a full city rather than a bad date, which is why
 * it survived. The dates are the whole point of these tests; the rendering is not.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/locales/en.json';
import { defaultStay } from '@/lib/defaultStay';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/stores/searchStore', () => ({ useSearchStore: (sel: (s: unknown) => unknown) => sel({ setIsSearching: vi.fn() }) }));
vi.mock('@/hooks/useDragScroll', () => ({ useDragScroll: () => ({ ref: { current: null }, onMouseDown: vi.fn() }) }));
vi.mock('@/lib/destination-images', () => ({ cityImagePath: () => '/x.jpg', attractionImagePath: () => '/x.jpg' }));

import PhilippinesCitiesSection from './PhilippinesCitiesSection';
import AsiaPacificAttractionsSection from './AsiaPacificAttractionsSection';

const wrap = (ui: React.ReactNode) =>
    render(<NextIntlClientProvider locale="en" messages={en as never}>{ui}</NextIntlClientProvider>);

/** The dates on the URL the card pushed. */
function pushedStay() {
    expect(push).toHaveBeenCalled();
    const url = new URL(push.mock.calls[0][0] as string, 'https://cheapestgo.com');
    return {
        checkIn:   url.searchParams.get('checkIn'),
        checkOut:  url.searchParams.get('checkOut'),
        datesAuto: url.searchParams.get('datesAuto'),
        lat:       url.searchParams.get('lat'),
    };
}

/** Today and tomorrow in the local calendar, which is what the URL used to carry. */
const localDay = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe.each([
    ['the world cities row', () => <PhilippinesCitiesSection />, 'Paris'],
    ['the attractions row',  () => <AsiaPacificAttractionsSection />, 'Eiffel Tower'],
])('%s', (_label, Section, cardName) => {
    beforeEach(() => push.mockClear());

    it('asks for the Default Stay, not today and tomorrow', () => {
        wrap(Section());
        fireEvent.click(screen.getByText(cardName));

        const stay = pushedStay();
        expect(stay).toMatchObject(defaultStay());
        expect(stay.checkIn).not.toBe(localDay(0));
        expect(stay.checkIn).not.toBe(localDay(1));
    });

    it('says the dates are ours, so the results page can offer the change', () => {
        wrap(Section());
        fireEvent.click(screen.getByText(cardName));
        expect(pushedStay().datesAuto).toBe('1');
    });
});

describe('the world cities row', () => {
    beforeEach(() => push.mockClear());

    it('carries the city centre, so the map has somewhere to open', () => {
        wrap(<PhilippinesCitiesSection />);
        fireEvent.click(screen.getByText('Paris'));
        expect(pushedStay().lat).toBe('48.8566');
    });
});
