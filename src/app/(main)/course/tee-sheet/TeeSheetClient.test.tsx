import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import en from '@/locales/en.json';
import type { TeeSheetOverview } from '@/lib/server/golf/teeSheet';

vi.mock('next-intl', () => ({
    useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
        let node: any = en;
        for (const part of `${namespace}.${key}`.split('.')) node = node?.[part];
        if (typeof node !== 'string') return `${namespace}.${key}`;
        return node.replace(/\{(\w+)\}/g, (_: string, name: string) => String(values?.[name] ?? ''));
    },
    useLocale: () => 'en-GB',
}));

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

import { TeeSheetClient } from './TeeSheetClient';

const COURSE = '6f1c2e0a-9b7d-4c1e-a2f5-3d8e1b0c7a44';
const sheet = (over: Partial<TeeSheetOverview> = {}): TeeSheetOverview => ({
    course: { id: COURSE, name: 'Mine GC', status: 'published', timezone: 'Asia/Manila', currency: 'USD', bookingWindowDays: 60 },
    schedules: [{
        id: 's1', courseId: COURSE, name: 'Mornings', daysOfWeek: [1, 2, 3], firstTee: '07:00', lastTee: '09:00',
        intervalMinutes: 10, spots: 4, pricePerPlayer: 100,
    }],
    blocks: [{
        id: 'b1', courseId: COURSE, startsOn: '2030-01-10', endsOn: '2030-01-10', weekdays: null, fromTime: null,
        toTime: null, note: "Members' competition", createdAt: '2030-01-01T00:00:00.000Z', closedTeeTimes: 12,
    }],
    extras: [{ code: 'cart', price: 25 }],
    changes: [{ id: 'c1', kind: 'block_added', summary: 'Blocked 2030-01-10 (12 tee times closed)', by: 'Ana Cruz', createdAt: '2030-01-01T00:00:00.000Z' }],
    day: {
        date: '2030-01-09',
        teeTimes: [
            { id: 't1', localTime: '07:00', pricePerPlayer: 100, currency: 'USD', spots: 4, spotsLeft: 2, status: 'open', booked: 2, closedBy: null },
            { id: 't2', localTime: '07:10', pricePerPlayer: 100, currency: 'USD', spots: 4, spotsLeft: 4, status: 'closed', booked: 0, closedBy: 'block' },
        ],
    },
    ...over,
});

const impact = (over: Record<string, unknown> = {}) =>
    ({ created: 0, updated: 0, closed: 0, reopened: 0, deleted: 0, leftAlone: 0, affectedBookings: [], ...over });

const fetchMock = vi.fn();
beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
});

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const bodies = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)));
const page = (over: Partial<TeeSheetOverview> = {}, courses = [{ id: COURSE, name: 'Mine GC' }]) =>
    render(<TeeSheetClient sheet={sheet(over)} courses={courses} />);

describe('TeeSheetClient', () => {
    it('shows the day, the schedules, the blocks, the extras and the history', () => {
        page();
        expect(screen.getByText('07:00')).toBeInTheDocument();
        expect(screen.getByText('Blocked')).toBeInTheDocument();
        expect(screen.getByText('2 booked')).toBeInTheDocument();
        expect(screen.getByText('Mornings')).toBeInTheDocument();
        expect(screen.getByText("Members' competition")).toBeInTheDocument();
        expect(screen.getByText('Closing now: 12')).toBeInTheDocument();
        expect(screen.getByLabelText('Offered: Golf cart')).toBeChecked();
        expect(screen.getByText('Blocked 2030-01-10 (12 tee times closed)')).toBeInTheDocument();
    });

    it('asks the server first, shows the impact, and applies only on confirmation', async () => {
        fetchMock
            .mockResolvedValueOnce(reply(200, { success: true, data: { preview: true, impact: impact({ closed: 4, affectedBookings: ['CG-ABC234'] }) } }))
            .mockResolvedValueOnce(reply(200, { success: true, data: { preview: false, impact: impact({ closed: 4 }) } }));
        page();

        fireEvent.click(screen.getByRole('button', { name: 'Add block' }));
        fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));

        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText('Tee times that stop being sold: 4')).toBeInTheDocument();
        expect(within(dialog).getByText(/CG-ABC234/)).toBeInTheDocument();
        expect(bodies()).toHaveLength(1);
        expect(bodies()[0]).toMatchObject({ courseId: COURSE, action: 'block_add', preview: true });

        fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
        await waitFor(() => expect(router.refresh).toHaveBeenCalled());
        expect(bodies()[1]).toMatchObject({ courseId: COURSE, action: 'block_add' });
        expect(bodies()[1].preview).toBeUndefined();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('applies nothing when the course cancels', async () => {
        fetchMock.mockResolvedValueOnce(reply(200, { success: true, data: { preview: true, impact: impact({ deleted: 30, closed: 2 }) } }));
        page();
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText('Tee times removed: 30')).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(router.refresh).not.toHaveBeenCalled();
    });

    it('says plainly when a change would not touch any tee time', async () => {
        fetchMock.mockResolvedValueOnce(reply(200, { success: true, data: { preview: true, impact: impact() } }));
        page();
        fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
        expect(await screen.findByText('This will not change any tee times.')).toBeInTheDocument();
    });

    it('shows the server\'s reason on the page when a delete is refused', async () => {
        fetchMock.mockResolvedValueOnce(reply(409, { success: false, error: "This is the course's last schedule. Unpublish the course before deleting it." }));
        page();
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        expect(await screen.findByRole('alert')).toHaveTextContent("last schedule");
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('puts field errors beside a schedule form and keeps it open', async () => {
        fetchMock.mockResolvedValueOnce(reply(400, { success: false, error: 'Some fields need attention', fieldErrors: { intervalMinutes: ['Between 5 and 60 minutes'] } }));
        page();
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        // jsdom checks a decimal step with float arithmetic and would block the click; browsers do not.
        fireEvent.submit(screen.getByRole('button', { name: 'Review changes' }).closest('form')!);
        expect(await screen.findByText('Between 5 and 60 minutes')).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(bodies()[0]).toMatchObject({ action: 'schedule_update', scheduleId: 's1', preview: true });
    });

    it('opens the block form from the day view', () => {
        page();
        fireEvent.click(screen.getByRole('button', { name: 'Block this day' }));
        expect(screen.getByRole('button', { name: /From date/ })).toBeInTheDocument();
    });

    it('saves extras as a set', async () => {
        fetchMock.mockResolvedValueOnce(reply(200, { success: true, data: { extras: [] } }));
        page();
        fireEvent.click(screen.getByLabelText('Offered: Caddie'));
        fireEvent.change(screen.getByLabelText('Caddie: Price each (USD)'), { target: { value: '30' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save extras' }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(bodies()[0]).toEqual({
            courseId: COURSE, action: 'extras_set', extras: [{ code: 'caddie', price: 30 }, { code: 'cart', price: 25 }],
        });
        expect(await screen.findByText('Extras saved.')).toBeInTheDocument();
    });

    it('offers no adding when the course has no time zone', () => {
        page({ course: { ...sheet().course, timezone: null }, schedules: [], blocks: [] });
        expect(screen.getByText(/no time zone yet/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Add schedule' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Add block' })).not.toBeInTheDocument();
    });

    it('switches between the courses a person acts for', () => {
        page({}, [{ id: COURSE, name: 'Mine GC' }, { id: 'c2', name: 'Other GC' }]);
        expect(screen.getByRole('link', { name: 'Other GC' })).toHaveAttribute('href', '/course/tee-sheet?course=c2');
        expect(screen.getByRole('link', { name: 'Mine GC' })).toHaveAttribute('aria-current', 'page');
    });
});
