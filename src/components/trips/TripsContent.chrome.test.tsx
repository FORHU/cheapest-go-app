import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react';
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
vi.mock('@/stores/authStore', () => ({ useUser: () => ({ id: 'u1' }), useAuthLoading: () => false }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('./BookingCard', () => ({ default: ({ booking }: { booking: { id: string } }) => <div>{booking.id}</div> }));
vi.mock('./FlightBookingCard', () => ({ default: ({ booking }: { booking: { id: string } }) => <div>{booking.id}</div> }));

import { TripsContent } from './TripsContent';
import { EMPTY_TRIPS, type TripsData } from '@/lib/trips/fetchTripsData';
import type { TripGolfBooking } from '@/lib/trips/golfBookings';

const data = (over: Partial<TripsData> = {}): TripsData => ({ ...EMPTY_TRIPS, ...over });
const hotel = (status: string, id = 'h1') =>
    ({ id, status, created_at: '2030-01-01T00:00:00.000Z', check_in: '2031-01-01', check_out: '2031-01-03' }) as never;
const flight = (status: string, id = 'f1') =>
    ({ id, status, pnr: 'ABC123', created_at: '2030-01-01T00:00:00.000Z', flight_segments: [] }) as never;
const golf = (status: TripGolfBooking['status'], id = 'g1'): TripGolfBooking => ({
    kind: 'golf', id, reference: 'CG-ABC234', status, courseName: 'Wack Wack Golf', courseSlug: 'wack-wack', city: 'Mandaluyong',
    startsAt: '2031-01-20T00:00:00.000Z', timezone: 'Asia/Manila', players: 2, total: 5200, currency: 'PHP',
    created_at: '2030-01-01T00:00:00.000Z',
});

beforeEach(() => {
    nav.search = '';
    vi.clearAllMocks();
});

describe('the page header', () => {
    it('is the title alone: it does not restate itself in a subtitle', () => {
        render(<TripsContent initialData={data()} />);
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(en.trips.myTrips);
        expect(screen.queryByText(en.trips.subtitle)).not.toBeInTheDocument();
    });
});

describe('the tabs', () => {
    it('are a real tablist: four tabs, one selected, and a panel they name', () => {
        render(<TripsContent initialData={data()} />);
        const tabs = within(screen.getByRole('tablist')).getAllByRole('tab');
        expect(tabs.map(t => t.textContent?.replace(/\d+$/, '').trim())).toEqual([
            en.trips.tabs.upcoming, en.trips.tabs.past, en.trips.tabs.all, en.trips.tabs.wishlist,
        ]);
        expect(tabs.filter(t => t.getAttribute('aria-selected') === 'true')).toHaveLength(1);
        expect(tabs[0]).toHaveAttribute('aria-selected', 'true');

        const panel = screen.getByRole('tabpanel');
        expect(panel).toHaveAttribute('aria-labelledby', tabs[0].id);
        expect(tabs[0]).toHaveAttribute('aria-controls', panel.id);
    });

    it('put only the selected tab in the tab order', () => {
        nav.search = 'tab=past';
        render(<TripsContent initialData={data()} />);
        const tabs = screen.getAllByRole('tab');
        expect(tabs.map(t => t.getAttribute('tabindex'))).toEqual(['-1', '0', '-1', '-1']);
    });

    it('move with the arrow keys, wrapping at the ends, and Home and End', () => {
        render(<TripsContent initialData={data()} />);
        const [upcoming] = screen.getAllByRole('tab');

        fireEvent.keyDown(upcoming, { key: 'ArrowRight' });
        expect(nav.router.replace).toHaveBeenLastCalledWith('?tab=past');

        fireEvent.keyDown(upcoming, { key: 'ArrowLeft' });
        expect(nav.router.replace).toHaveBeenLastCalledWith('?tab=wishlist');

        fireEvent.keyDown(upcoming, { key: 'End' });
        expect(nav.router.replace).toHaveBeenLastCalledWith('?tab=wishlist');

        fireEvent.keyDown(screen.getAllByRole('tab')[1], { key: 'Home' });
        expect(nav.router.replace).toHaveBeenLastCalledWith('?');
    });

    it('count only what needs attention: upcoming carries a number, the others do not', () => {
        const g = golf('confirmed');
        render(<TripsContent initialData={data({ golfBookings: [g], upcomingGolfBookings: [g] })} />);
        const [upcoming, past, all] = screen.getAllByRole('tab');
        expect(within(upcoming).getByText('1')).toBeInTheDocument();
        expect(past).toHaveTextContent(/^Past$/);
        expect(all).toHaveTextContent(/^All$/);
    });

    it('use the one accent for the selected tab, wishlist included: rose is for errors', () => {
        nav.search = 'tab=wishlist';
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [] }))));
        const { container } = render(<TripsContent initialData={data()} />);
        const wishlist = screen.getByRole('tab', { name: new RegExp(en.trips.tabs.wishlist) });
        expect(wishlist.className).toMatch(/text-blue-600/);
        expect(container.innerHTML).not.toMatch(/rose/);
    });
});

describe('the wishlist', () => {
    const saved = [{
        id: 's1', type: 'hotel', title: 'Shangri-La Makati', subtitle: 'Makati', price: 8200, currency: 'PHP',
        deep_link: '/search?q=x', created_at: '2030-02-03T00:00:00.000Z',
    }];

    beforeEach(() => {
        nav.search = 'tab=wishlist';
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: saved }))));
    });

    it('keeps its actions in reach without a mouse, at a size a thumb can hit', async () => {
        render(<TripsContent initialData={data()} />);
        const remove = await screen.findByRole('button', { name: en.trips.wishlist.removeFromWishlist });
        expect(remove.className).toMatch(/h-11/);
        expect(remove.className).toMatch(/w-11/);
        // Hidden until hover only from the sm breakpoint up, where there is a pointer to hover with.
        expect(remove.parentElement!.className).toMatch(/sm:opacity-0/);
        expect(remove.parentElement!.className).not.toMatch(/(^|\s)opacity-0/);
        expect(remove.parentElement!.className).toMatch(/focus-within:opacity-100/);
    });

    it('uses the same hotel icon as the booking cards, in the same neutral tile', async () => {
        const { container } = render(<TripsContent initialData={data()} />);
        await screen.findByText('Shangri-La Makati');
        expect(container.innerHTML).not.toMatch(/amber/);
    });

    it('removes an item optimistically', async () => {
        render(<TripsContent initialData={data()} />);
        fireEvent.click(await screen.findByRole('button', { name: en.trips.wishlist.removeFromWishlist }));
        await waitFor(() => expect(screen.queryByText('Shangri-La Makati')).not.toBeInTheDocument());
    });
});

describe('polling for changes', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

    it('does not poll when every booking has settled', () => {
        render(<TripsContent initialData={data({
            bookings: [hotel('confirmed')], flightBookings: [flight('ticketed')], golfBookings: [golf('confirmed')],
        })} />);
        tick(5 * 60_000);
        expect(nav.router.refresh).not.toHaveBeenCalled();
    });

    it.each([
        ['a hotel stay awaiting confirmation', { bookings: [hotel('pending')] }],
        ['a flight awaiting its ticket', { flightBookings: [flight('awaiting_ticket')] }],
        ['a flight whose refund is processing', { flightBookings: [flight('refund_pending')] }],
        ['a tee time awaiting the course', { golfBookings: [golf('requested')] }],
    ] as const)('polls every 30 seconds while there is %s', (_label, over) => {
        render(<TripsContent initialData={data(over as Partial<TripsData>)} />);
        tick(29_000);
        expect(nav.router.refresh).not.toHaveBeenCalled();
        tick(2_000);
        expect(nav.router.refresh).toHaveBeenCalledTimes(1);
        tick(30_000);
        expect(nav.router.refresh).toHaveBeenCalledTimes(2);
    });

    it('stays quiet while the tab is hidden', () => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        render(<TripsContent initialData={data({ bookings: [hotel('pending')] })} />);
        tick(60_000);
        expect(nav.router.refresh).not.toHaveBeenCalled();
    });

    it('stops once the booking settles', () => {
        const { rerender } = render(<TripsContent initialData={data({ bookings: [hotel('pending')] })} />);
        tick(31_000);
        expect(nav.router.refresh).toHaveBeenCalledTimes(1);

        rerender(<TripsContent initialData={data({ bookings: [hotel('confirmed')] })} />);
        tick(5 * 60_000);
        expect(nav.router.refresh).toHaveBeenCalledTimes(1);
    });
});
