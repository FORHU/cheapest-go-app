import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import en from '@/locales/en.json';
import type { CourseBookingView } from '@/lib/schemas/golfStaff';

vi.mock('next-intl', () => ({
    useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
        let node: any = en;
        for (const part of `${namespace}.${key}`.split('.')) node = node?.[part];
        if (typeof node !== 'string') return `${namespace}.${key}`;
        return node.replace(/\{(\w+)\}/g, (_: string, name: string) => String(values?.[name] ?? ''));
    },
    useLocale: () => 'en-GB',
}));

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

import { CourseQueueClient } from './CourseQueueClient';

const course = { id: 'c1', slug: 'mine', name: 'Mine GC', city: 'Manila', country: 'Philippines', status: 'published' as const };

const booking = (over: Partial<CourseBookingView> = {}): CourseBookingView => ({
    id: 'b1', reference: 'CG-ABC234', status: 'requested', courseId: 'c1', courseName: 'Mine GC',
    timezone: 'Asia/Manila', startsAt: '2026-10-20T00:00:00.000Z', players: 2, leadName: 'Ana Cruz',
    extras: [{ code: 'cart', quantity: 1 }], greenFeeTotal: 170, currency: 'USD',
    decideBy: '2026-10-14T00:00:00.000Z', requestedAt: '2026-10-12T00:00:00.000Z', ...over,
});

const fetchMock = vi.fn();
beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
});

const page = (over: Partial<Parameters<typeof CourseQueueClient>[0]> = {}) =>
    render(<CourseQueueClient courses={[course]} waiting={[booking()]} upcoming={[]} past={[]} {...over} />);

describe('CourseQueueClient', () => {
    it('shows the waiting request with what the course needs to recognise it', () => {
        page();
        expect(screen.getByRole('heading', { name: 'Course portal' })).toBeInTheDocument();
        expect(screen.getByText('Ana Cruz')).toBeInTheDocument();
        expect(screen.getByText('2 players')).toBeInTheDocument();
        expect(screen.getByText('Golf cart × 1')).toBeInTheDocument();
        expect(screen.getByText('CG-ABC234')).toBeInTheDocument();
        // 08:00 on the course's own clock, not the viewer's.
        expect(screen.getByText('08:00')).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /Waiting for you/ })).toHaveAttribute('aria-selected', 'true');
    });

    it('confirms with one press and refreshes the page', async () => {
        page();
        fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
        await waitFor(() => expect(router.refresh).toHaveBeenCalled());
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('/api/course/golf-bookings');
        expect(JSON.parse(String(init.body))).toEqual({ action: 'confirm', id: 'b1' });
        expect(toast.success).toHaveBeenCalledWith('CG-ABC234 confirmed');
    });

    it('asks before declining, as the admin does, and declines on Yes', async () => {
        page();
        fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
        // Asking is not deciding: the card is only released once it is confirmed.
        expect(fetchMock).not.toHaveBeenCalled();
        expect(screen.getByText('Decline?')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))).toEqual({ action: 'decline', id: 'b1' });
        expect(toast.success).toHaveBeenCalledWith('CG-ABC234 declined');
    });

    it('backs out of a decline on No without calling the server', () => {
        page();
        fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
        fireEvent.click(screen.getByRole('button', { name: 'No' }));
        expect(fetchMock).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    });

    it('says what went wrong and leaves the row in place', async () => {
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'That booking was already decided.' }), { status: 409 }));
        page();
        fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('That booking was already decided.'));
        expect(toast.success).not.toHaveBeenCalled();
        expect(router.refresh).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled();
    });

    it('moves between tabs, and shows no actions on settled bookings', () => {
        page({ upcoming: [booking({ id: 'b2', status: 'confirmed', leadName: 'Ben Reyes' })] });
        fireEvent.click(screen.getByRole('tab', { name: 'Upcoming' }));
        expect(screen.getByText('Ben Reyes')).toBeInTheDocument();
        expect(screen.getByText('Confirmed')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
    });

    it('says plainly when nothing is waiting, and when the account has no course', () => {
        const { unmount } = page({ waiting: [] });
        expect(screen.getByText(/Nothing is waiting/)).toBeInTheDocument();
        unmount();
        page({ courses: [], waiting: [] });
        expect(screen.getByText('You are not attached to a course yet.')).toBeInTheDocument();
    });

    it('names the course on each row only when the account has several', () => {
        const { unmount } = page();
        // One course: its name is in the header only.
        expect(screen.getAllByText('Mine GC')).toHaveLength(1);
        unmount();
        page({ courses: [course, { ...course, id: 'c2', name: 'Other GC' }] });
        // Several: the header lists both, and the row says which one it is for.
        expect(screen.getByText('Mine GC · Other GC')).toBeInTheDocument();
        expect(screen.getByText('Mine GC')).toBeInTheDocument();
    });
});
