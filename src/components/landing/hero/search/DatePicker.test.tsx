import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { useSearchStore } from '@/stores/searchStore';
import { DatePicker } from './DatePicker';
import en from '@/locales/en.json';

/**
 * QA BG-5: with check-in set, the check-out calendar left earlier days selectable.
 */

// The 15th of the month after next: never past, never today, whole month on screen.
const now = new Date();
const checkIn = new Date(now.getFullYear(), now.getMonth() + 2, 15);

const day = (n: number) =>
    screen.getAllByRole('button').find(b => b.textContent === String(n)) as HTMLButtonElement;

function renderPicker(props: { initialCheckOutMode?: boolean }) {
    return render(
        <NextIntlClientProvider locale="en" messages={en} onError={() => {}}>
            <DatePicker inline forceOpen onDone={() => {}} {...props} />
        </NextIntlClientProvider>,
    );
}

beforeEach(() => {
    useSearchStore.setState(s => ({ dates: { ...s.dates, checkIn, checkOut: null } }));
});

describe('Stays date picker', () => {
    it('disables every day before check-in while choosing check-out', () => {
        renderPicker({ initialCheckOutMode: true });
        expect(day(10).disabled).toBe(true);
        expect(day(14).disabled).toBe(true);
    });

    it('does not let check-in\'s own day become check-out (a zero-night stay)', () => {
        renderPicker({ initialCheckOutMode: true });
        fireEvent.click(day(15));
        expect(day(15).disabled).toBe(true);
        expect(useSearchStore.getState().dates.checkOut).toBeNull();
    });

    it('takes a later day as check-out', () => {
        renderPicker({ initialCheckOutMode: true });
        fireEvent.click(day(18));
        expect(new Date(useSearchStore.getState().dates.checkOut!).getDate()).toBe(18);
    });

    it('opened from check-in, earlier days can still be picked as the new check-in', () => {
        renderPicker({});
        expect(day(10).disabled).toBe(false);
        fireEvent.click(day(10));
        const { checkIn: picked, checkOut } = useSearchStore.getState().dates;
        expect(new Date(picked!).getDate()).toBe(10);
        expect(checkOut).toBeNull();
        // …and the picker moves on to check-out, where days before the 10th are now closed.
        expect(day(9).disabled).toBe(true);
    });
});
