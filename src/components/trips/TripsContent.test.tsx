import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import en from '@/locales/en.json';

vi.mock('next-intl', () => ({
    useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
        let node: any = en;
        for (const part of `${namespace}.${key}`.split('.')) node = node?.[part];
        if (typeof node !== 'string') return `${namespace}.${key}`;
        return node.replace(/\{(\w+)\}/g, (_: string, name: string) => String(values?.[name] ?? ''));
    },
    useLocale: () => 'en',
}));

const nav = vi.hoisted(() => ({ search: '' as string, router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() } }));
vi.mock('next/navigation', () => ({
    useRouter: () => nav.router,
    useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock('@/stores/authStore', () => ({
    useUser: () => ({ id: 'u1' }),
    useAuthLoading: () => false,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
// The hotel and flight cards are large and not what is under test here.
vi.mock('./BookingCard', () => ({ default: ({ booking }: { booking: { id: string } }) => <div data-testid="hotel">{booking.id}</div> }));
vi.mock('./FlightBookingCard', () => ({ default: ({ booking }: { booking: { id: string } }) => <div data-testid="flight">{booking.id}</div> }));

import { TripsContent } from './TripsContent';
import { EMPTY_TRIPS, type TripsData } from '@/lib/trips/fetchTripsData';
import type { TripGolfBooking } from '@/lib/trips/golfBookings';

const golf = (over: Partial<TripGolfBooking> = {}): TripGolfBooking => ({
    kind: 'golf', id: 'g1', reference: 'CG-ABC234', status: 'confirmed', courseName: 'Wack Wack Golf', courseSlug: 'wack-wack', city: 'Mandaluyong',
    startsAt: '2030-01-20T00:00:00.000Z', timezone: 'Asia/Manila', players: 2, total: 5200, currency: 'PHP',
    created_at: '2030-01-01T00:00:00.000Z', ...over,
});
const hotel = (id: string, created_at: string) => ({ id, created_at }) as never;

const data = (over: Partial<TripsData> = {}): TripsData => ({ ...EMPTY_TRIPS, ...over });

beforeEach(() => { nav.search = ''; });

describe('TripsContent with golf', () => {
    it('lists an upcoming golf booking on the default tab, and counts it', () => {
        const g = golf();
        render(<TripsContent initialData={data({ golfBookings: [g], upcomingGolfBookings: [g] })} />);
        expect(screen.getByText('Wack Wack Golf')).toBeInTheDocument();
        expect(within(screen.getByRole('tab', { name: /Upcoming/ })).getByText('1')).toBeInTheDocument();
    });

    it('is not an empty page when golf is all there is', () => {
        const g = golf();
        render(<TripsContent initialData={data({ golfBookings: [g], upcomingGolfBookings: [g] })} />);
        expect(screen.queryByText(en.trips.emptyState.upcomingTitle)).not.toBeInTheDocument();
    });

    it('still shows the empty state when there is nothing at all', () => {
        render(<TripsContent initialData={data()} />);
        expect(screen.getByText(en.trips.emptyState.upcomingTitle)).toBeInTheDocument();
    });

    it('puts a played tee time and a cancelled booking under Past, and not under Upcoming', () => {
        const played = golf({ id: 'played', courseName: 'Played GC', startsAt: '2020-01-01T00:00:00.000Z' });
        const gone = golf({ id: 'gone', courseName: 'Cancelled GC', status: 'cancelled' });
        const initialData = data({
            golfBookings: [played, gone], pastGolfBookings: [played], cancelledGolfBookings: [gone],
        });

        const { unmount } = render(<TripsContent initialData={initialData} />);
        expect(screen.queryByText('Played GC')).not.toBeInTheDocument();
        unmount();

        nav.search = 'tab=past';
        render(<TripsContent initialData={initialData} />);
        expect(screen.getByText('Played GC')).toBeInTheDocument();
        expect(screen.getByText('Cancelled GC')).toBeInTheDocument();
    });

    it('shows every golf booking under All', () => {
        nav.search = 'tab=all';
        const a = golf({ id: 'a', courseName: 'First GC' });
        const b = golf({ id: 'b', courseName: 'Second GC', status: 'declined' });
        render(<TripsContent initialData={data({ golfBookings: [a, b] })} />);
        expect(screen.getByText('First GC')).toBeInTheDocument();
        expect(screen.getByText('Second GC')).toBeInTheDocument();
    });

    it('interleaves golf with hotels by when each was booked, newest first', () => {
        nav.search = 'tab=all';
        const newest = golf({ id: 'g-new', courseName: 'Newest GC', created_at: '2030-03-01T00:00:00.000Z' });
        render(<TripsContent initialData={data({
            bookings: [hotel('h-old', '2030-01-01T00:00:00.000Z'), hotel('h-mid', '2030-02-01T00:00:00.000Z')],
            golfBookings: [newest],
        })} />);
        const order = screen.getAllByText(/^(Newest GC|h-mid|h-old)$/).map(el => el.textContent);
        expect(order).toEqual(['Newest GC', 'h-mid', 'h-old']);
    });
});
