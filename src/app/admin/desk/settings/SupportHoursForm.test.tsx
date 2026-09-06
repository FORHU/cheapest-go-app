import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SupportHoursForm } from './SupportHoursForm';

/**
 * Editing when the desk is open.
 *
 * The one setting in this whole feature that could only be changed with raw SQL until now.
 * What matters is that a day can be closed and reopened without losing its times, that the
 * server's complaint is shown rather than swallowed, and that saving sends the whole week
 * — a half-saved schedule is the state nobody can tell apart from the one they meant.
 */

const hours = {
    timezone: 'Asia/Manila',
    days: {
        mon: { open: '09:00', close: '18:00' },
        tue: { open: '09:00', close: '18:00' },
        wed: null,
        thu: null,
        fri: null,
        sat: null,
        sun: null,
    },
};

let fetchMock: ReturnType<typeof vi.fn>;

function mockSave(ok = true, error = 'mon: opens and closes at the same time.') {
    fetchMock = vi.fn(async () => ({
        ok,
        json: async () => (ok ? { hours } : { error }),
    }));
    vi.stubGlobal('fetch', fetchMock);
}

beforeEach(() => mockSave());
afterEach(() => vi.unstubAllGlobals());

describe('SupportHoursForm', () => {
    it('shows every day of the week', () => {
        render(<SupportHoursForm initialHours={hours} />);

        for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
            expect(screen.getByText(day), day).toBeInTheDocument();
        }
    });

    it('marks a day with no window as closed', () => {
        render(<SupportHoursForm initialHours={hours} />);

        expect(screen.getByRole('checkbox', { name: /wednesday open/i })).not.toBeChecked();
        expect(screen.getByRole('checkbox', { name: /monday open/i })).toBeChecked();
    });

    it('keeps the times when a day is closed and reopened', () => {
        // Closing a day should not lose what was typed: reopening it and finding 00:00 is
        // how a schedule quietly becomes wrong.
        render(<SupportHoursForm initialHours={hours} />);

        const monday = screen.getByRole('checkbox', { name: /monday open/i });
        fireEvent.click(monday);
        fireEvent.click(monday);

        expect(screen.getByLabelText(/monday opens/i)).toHaveValue('09:00');
        expect(screen.getByLabelText(/monday closes/i)).toHaveValue('18:00');
    });

    it('sends the whole week, not just what changed', async () => {
        render(<SupportHoursForm initialHours={hours} />);

        fireEvent.change(screen.getByLabelText(/monday opens/i), { target: { value: '08:00' } });
        fireEvent.click(screen.getByRole('button', { name: /save/i }));

        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);

        expect(body.hours.days.mon).toEqual({ open: '08:00', close: '18:00' });
        expect(Object.keys(body.hours.days).sort())
            .toEqual(['fri', 'mon', 'sat', 'sun', 'thu', 'tue', 'wed']);
        expect(body.hours.days.wed).toBeNull();
    });

    it("shows the server's complaint instead of swallowing it", async () => {
        // The server names the day and the problem. Replacing that with "Save failed"
        // throws away the only part that tells you what to fix.
        mockSave(false, 'mon: "9am" is not a time. Use HH:MM.');
        render(<SupportHoursForm initialHours={hours} />);

        fireEvent.click(screen.getByRole('button', { name: /save/i }));

        await waitFor(() =>
            expect(screen.getByRole('alert')).toHaveTextContent('mon: "9am" is not a time. Use HH:MM.'),
        );
    });

    it('confirms when it saved', async () => {
        render(<SupportHoursForm initialHours={hours} />);

        fireEvent.click(screen.getByRole('button', { name: /save/i }));

        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/saved/i));
    });
});
