/**
 * Round-trip flights pick both legs from the departure calendar: choose the
 * outbound, and the same open calendar rolls straight into the return.
 */
import React, { useState } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('next-intl', () => ({
    useTranslations: () => {
        const t: any = (k: string) => k;
        t.raw = (k: string) => {
            if (k === 'months') return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            if (k === 'days') return ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
            return [];
        };
        return t;
    },
    useLocale: () => 'en',
}));

import { FlightDatePicker, FlightDateRange } from '@/components/landing/hero/search/FlightDatePicker';

const captured: FlightDateRange[] = [];

function RangeHarness({ editing = 'start' as 'start' | 'end' }) {
    const [range, setRange] = useState<FlightDateRange>({ startDate: null, endDate: null });
    const [isOpen, setIsOpen] = useState(false);

    return (
        <FlightDatePicker
            label="depart"
            date={editing === 'start' ? range.startDate : range.endDate}
            onChange={() => { }}
            isOpen={isOpen}
            onToggle={setIsOpen}
            range={{
                startDate: range.startDate,
                endDate: range.endDate,
                editing,
                onChange: (next) => {
                    captured.push(next);
                    setRange(next);
                },
            }}
        />
    );
}

const day = (n: string) => {
    const btn = screen.getAllByRole('button', { name: n }).find((b) => b.textContent === n);
    if (!btn) throw new Error(`no day button ${n}`);
    return btn;
};

const openCalendar = () => fireEvent.click(screen.getByText('depart'));

describe('FlightDatePicker — round-trip range mode', () => {
    beforeEach(() => {
        captured.length = 0;
        // Pin "today" to the 1st so the rest of the month is selectable
        vi.setSystemTime(new Date(2026, 7, 1, 12, 0, 0));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('takes the return date from the same calendar the departure was picked in', () => {
        render(<RangeHarness />);
        openCalendar();

        fireEvent.click(day('12'));
        expect(captured[0]).toEqual({ startDate: new Date(2026, 7, 12), endDate: null });

        // Calendar is still open — the next click fills the return leg
        fireEvent.click(day('20'));
        expect(captured[1]).toEqual({ startDate: new Date(2026, 7, 12), endDate: new Date(2026, 7, 20) });
    });

    it('drops the return when the new departure lands after it', () => {
        render(<RangeHarness />);
        openCalendar();

        fireEvent.click(day('12'));
        fireEvent.click(day('15'));
        // Completing the range hands the next click back to the outbound leg
        fireEvent.click(day('20'));

        expect(captured[2]).toEqual({ startDate: new Date(2026, 7, 20), endDate: null });
    });

    it('keeps the return when a re-picked departure still falls before it', () => {
        render(<RangeHarness />);
        openCalendar();

        fireEvent.click(day('12'));
        fireEvent.click(day('20'));
        fireEvent.click(day('8'));

        expect(captured[2]).toEqual({ startDate: new Date(2026, 7, 8), endDate: new Date(2026, 7, 20) });
    });

    it('opened from the return card, fills the departure first when none is set', () => {
        render(<RangeHarness editing="end" />);
        openCalendar();

        fireEvent.click(day('12'));
        expect(captured[0]).toEqual({ startDate: new Date(2026, 7, 12), endDate: null });

        fireEvent.click(day('15'));
        expect(captured[1]).toEqual({ startDate: new Date(2026, 7, 12), endDate: new Date(2026, 7, 15) });
    });

    it('leaves single-date mode alone when no range is given', () => {
        const onChange = vi.fn();
        const Single = () => {
            const [isOpen, setIsOpen] = useState(false);
            return (
                <FlightDatePicker
                    label="depart"
                    date={null}
                    onChange={onChange}
                    isOpen={isOpen}
                    onToggle={setIsOpen}
                />
            );
        };
        render(<Single />);
        openCalendar();

        fireEvent.click(day('12'));

        expect(onChange).toHaveBeenCalledWith(new Date(2026, 7, 12));
        expect(screen.queryByText('return')).toBeNull();
    });
});
