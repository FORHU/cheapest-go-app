/**
 * The search bar's dates: what it shows, and what it submits.
 *
 * Two live bugs met here. The bar read its dates back out with `toISOString()` on a Date
 * holding *local* midnight, so east of Greenwich it submitted the day before the one on
 * screen — a traveller in Manila picking Tue 29 searched Mon 28. And the landing cards
 * sent a stay nobody asked for without saying so, which is what `datesAuto` now discloses.
 *
 * The store is seeded rather than synced: the bar copies the URL into it in a mount effect,
 * and these tests are about what happens *after* that, which is the only state a traveller
 * ever sees. Every control is queried with `getAllBy` because the bar lays out a mobile row
 * and a desktop row, so each one exists twice.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/locales/en.json';

const push = vi.fn();
let currentUrl = '';

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push }),
    useSearchParams: () => new URLSearchParams(currentUrl),
}));

/** Local midnight, exactly as the real store holds it — the whole point of the UTC bug. */
const localMidnight = (day: string) => new Date(`${day}T00:00:00`);

const store: { checkIn: Date | null; checkOut: Date | null } = { checkIn: null, checkOut: null };
vi.mock('@/stores/searchStore', () => ({
    useSearchStore: () => ({ setDates: vi.fn(), setActiveDropdown: vi.fn() }),
    useDates: () => ({ checkIn: store.checkIn, checkOut: store.checkOut }),
    useActiveDropdown: () => null,
    useUserCurrency: () => 'USD',
    useSearchFilters: () => ({}),
}));
vi.mock('@/components/landing/hero/search/DatePicker', () => ({ DatePicker: () => null }));

import { SearchRefinementBar } from './SearchMapView';

const PICKED = { destination: 'New York, USA', checkIn: '2026-10-02', checkOut: '2026-10-04', datesAuto: '1' };

/** Render with the store already holding `showing` — what the mount effect leaves behind. */
function wrap(params: Record<string, string>, showing: { in: string; out: string }) {
    store.checkIn = localMidnight(showing.in);
    store.checkOut = localMidnight(showing.out);
    currentUrl = new URLSearchParams(params).toString();
    return render(
        <NextIntlClientProvider locale="en" messages={en as never}>
            <SearchRefinementBar rawSearchParams={params} />
        </NextIntlClientProvider>,
    );
}

const submit = () => {
    screen.getAllByRole('button', { name: /search/i })[0].click();
    expect(push).toHaveBeenCalled();
    return new URL(push.mock.calls[0][0] as string, 'https://cheapestgo.com').searchParams;
};

describe('a stay the traveller did not choose', () => {
    beforeEach(() => push.mockClear());

    it('says so, so the dates can be changed rather than just accepted', () => {
        wrap(PICKED, { in: '2026-10-02', out: '2026-10-04' });
        expect(screen.getAllByText(/we picked these dates/i)[0]).toBeInTheDocument();
    });

    it('stays quiet when the traveller named the dates themselves', () => {
        wrap({ ...PICKED, datesAuto: '' }, { in: '2026-10-02', out: '2026-10-04' });
        expect(screen.queryByText(/we picked these dates/i)).not.toBeInTheDocument();
    });

    it('stays quiet once a date has been moved', () => {
        // The picker has written to the store; the URL still carries the stay we suggested.
        wrap(PICKED, { in: '2026-11-20', out: '2026-11-22' });
        expect(screen.queryByText(/we picked these dates/i)).not.toBeInTheDocument();
    });
});

describe('the date it submits', () => {
    beforeEach(() => push.mockClear());

    it('is the date on screen, not the day before', () => {
        // The bug: local midnight through toISOString() lands on the previous UTC day for
        // anyone east of Greenwich, so the URL disagreed with the pill the whole time.
        wrap(PICKED, { in: '2026-10-02', out: '2026-10-04' });
        expect(screen.getAllByText(/Oct 2/)[0]).toBeInTheDocument();

        const q = submit();
        expect(q.get('checkIn')).toBe('2026-10-02');
        expect(q.get('checkOut')).toBe('2026-10-04');
    });

    it("drops the flag, because a submitted stay is the traveller's own", () => {
        wrap(PICKED, { in: '2026-10-02', out: '2026-10-04' });
        expect(submit().get('datesAuto')).toBeNull();
    });
});
