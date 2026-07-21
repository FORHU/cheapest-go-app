/**
 * Regression: the date picker on the map search view closed the moment you
 * clicked a day, so a check-in/check-out range could never be completed.
 *
 * SearchMapView mounts its mobile and desktop layouts at the same time and
 * hides one with CSS. Both mount a <DatePicker triggerDropdown="dates-in" />,
 * so opening the calendar opens BOTH instances. The hidden copy's
 * click-outside handler saw a click inside the visible copy as an outside
 * click and called setActiveDropdown(null), slamming the calendar shut.
 *
 * This reproduces that with two same-id pickers, matching SearchMapView.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('next-intl', () => ({
    useTranslations: () => {
        const t: any = (k: string) => k;
        t.raw = (k: string) => {
            if (k === 'months') return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            if (k === 'days') return ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
            if (k === 'flexOptions') return ['Exact', '+/- 1 day'];
            return [];
        };
        return t;
    },
    useLocale: () => 'en',
}));

import { DatePicker } from '@/components/landing/hero/search/DatePicker';
import { useSearchStore } from '@/stores/searchStore';

/** Mirrors SearchMapView: both layouts mounted, one CSS-hidden. */
function MapHeaderHarness() {
    const setActiveDropdown = useSearchStore((s) => s.setActiveDropdown);
    return (
        <div>
            {/* mobile layout — hidden on desktop, but still mounted */}
            <div style={{ display: 'none' }}>
                <div className="relative">
                    <div data-datepicker-trigger onClick={() => setActiveDropdown('dates-in')}>
                        mobile check-in
                    </div>
                    <DatePicker triggerDropdown="dates-in" />
                </div>
            </div>

            {/* desktop layout — the one the user actually sees */}
            <div>
                <div className="relative">
                    <div data-datepicker-trigger onClick={() => setActiveDropdown('dates-in')}>
                        desktop check-in
                    </div>
                    <DatePicker triggerDropdown="dates-in" />
                </div>
            </div>
        </div>
    );
}

describe('DatePicker — duplicate instances for one dropdown id', () => {
    beforeEach(() => {
        // Pin "today" to the 1st so every other day of the month is selectable
        // (past days and today itself are disabled in the calendar).
        vi.setSystemTime(new Date(2026, 6, 1, 12, 0, 0));
        useSearchStore.setState({
            dates: { checkIn: null, checkOut: null, flexibility: 0 } as any,
            activeDropdown: null,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('stays open when a day is clicked, and records the date', () => {
        render(<MapHeaderHarness />);

        fireEvent.click(screen.getByText('desktop check-in'));
        expect(useSearchStore.getState().activeDropdown).toBe('dates-in');

        // July 2026 is showing; the 20th is comfortably in the future.
        const dayButtons = screen.getAllByRole('button', { name: '20' });
        const visibleDay = dayButtons[dayButtons.length - 1];
        expect(visibleDay).not.toBeDisabled();

        // A real click is mousedown -> mouseup -> click. The bug fired on mousedown.
        fireEvent.mouseDown(visibleDay);
        fireEvent.click(visibleDay);

        // The calendar must still be open so a check-out can be chosen.
        expect(useSearchStore.getState().activeDropdown).toBe('dates-in');
        expect(useSearchStore.getState().dates.checkIn).toBeTruthy();
    });

    it('still closes when clicking genuinely outside', () => {
        render(
            <div>
                <button>somewhere else</button>
                <MapHeaderHarness />
            </div>
        );

        fireEvent.click(screen.getByText('desktop check-in'));
        expect(useSearchStore.getState().activeDropdown).toBe('dates-in');

        fireEvent.mouseDown(screen.getByText('somewhere else'));

        expect(useSearchStore.getState().activeDropdown).toBeNull();
    });
});
