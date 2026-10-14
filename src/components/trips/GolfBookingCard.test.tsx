import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

import GolfBookingCard from './GolfBookingCard';
import type { TripGolfBooking } from '@/lib/trips/golfBookings';

const booking = (over: Partial<TripGolfBooking> = {}): TripGolfBooking => ({
    kind: 'golf', id: 'b1', reference: 'CG-ABC234', status: 'confirmed', courseName: 'Wack Wack Golf', courseSlug: 'wack-wack',
    city: 'Mandaluyong',
    // 08:00 on the course's clock.
    startsAt: '2030-01-20T00:00:00.000Z', timezone: 'Asia/Manila', players: 2, total: 5200, currency: 'PHP',
    created_at: '2030-01-01T00:00:00.000Z', ...over,
});

describe('GolfBookingCard', () => {
    it('shows the course, where it is, the tee time on the course\'s clock, the party and what was paid', () => {
        render(<GolfBookingCard booking={booking()} />);
        expect(screen.getByRole('article', { name: 'Wack Wack Golf' })).toBeInTheDocument();
        expect(screen.getByText('Mandaluyong')).toBeInTheDocument();
        // The date block and the time are both the course's.
        expect(screen.getByText('20')).toBeInTheDocument();
        expect(screen.getByText('Jan')).toBeInTheDocument();
        expect(screen.getByText(/8:00\s?AM/)).toBeInTheDocument();
        expect(screen.getByText('2 players')).toBeInTheDocument();
        expect(screen.getByTestId('card-money')).toHaveTextContent('₱5,200');
        expect(screen.getByText('Ref. CG-ABC234')).toBeInTheDocument();
    });

    it('reads the time on the course\'s clock whatever the viewer\'s', () => {
        // 16:00Z is midnight in Manila the next day; the card reads the course's clock, not the machine's.
        render(<GolfBookingCard booking={booking({ startsAt: '2030-01-19T16:00:00.000Z' })} />);
        expect(screen.getByText('20')).toBeInTheDocument();
        expect(screen.getByText(/12:00\s?AM/)).toBeInTheDocument();
    });

    it('uses the singular for one player', () => {
        render(<GolfBookingCard booking={booking({ players: 1 })} />);
        expect(screen.getByText('1 player')).toBeInTheDocument();
    });

    it.each([
        ['requested', 'Awaiting confirmation'],
        ['confirmed', 'Confirmed'],
        ['declined', 'Declined'],
        ['cancelled', 'Cancelled'],
    ] as const)('says %s as "%s"', (status, label) => {
        render(<GolfBookingCard booking={booking({ status })} />);
        expect(screen.getByText(label)).toBeInTheDocument();
    });

    it('steps the amount back when nothing was charged', () => {
        render(<GolfBookingCard booking={booking({ status: 'declined' })} />);
        expect(screen.getByTestId('card-money').querySelector('p')).toHaveClass('line-through');
    });

    it('says a request is only authorised, and a confirmed booking is paid', () => {
        const { unmount } = render(<GolfBookingCard booking={booking({ status: 'requested' })} />);
        expect(screen.getByText(en.trips.golfCard.chargedOnConfirmation)).toBeInTheDocument();
        unmount();

        render(<GolfBookingCard booking={booking({ status: 'confirmed' })} />);
        expect(screen.getByText(en.trips.bookingCard.totalPaid)).toBeInTheDocument();
    });

    it('captions nothing for a booking that was never charged, the strike-through says it', () => {
        render(<GolfBookingCard booking={booking({ status: 'cancelled' })} />);
        expect(screen.queryByText(en.trips.bookingCard.totalPaid)).toBeNull();
        expect(screen.queryByText(en.trips.golfCard.chargedOnConfirmation)).toBeNull();
    });

    it('drops cents that are zero, as the hotel and flight cards do, and keeps them when real', () => {
        const { unmount } = render(<GolfBookingCard booking={booking({ total: 491, currency: 'USD' })} />);
        expect(screen.getByTestId('card-money')).toHaveTextContent('$491');
        expect(screen.getByTestId('card-money')).not.toHaveTextContent('491.00');
        unmount();

        render(<GolfBookingCard booking={booking({ total: 491.37, currency: 'USD' })} />);
        expect(screen.getByTestId('card-money')).toHaveTextContent('$491.37');
    });

    it('draws the date in the accent while the tee time is ahead and still on', () => {
        render(<GolfBookingCard booking={booking({ status: 'confirmed' })} />);
        expect(screen.getByText('Jan')).toHaveClass('text-blue-600');
    });

    it('lets the date go quiet once the tee time is over, or the booking never happened', () => {
        const { unmount } = render(<GolfBookingCard booking={booking({ startsAt: '2020-01-20T00:00:00.000Z' })} />);
        expect(screen.getByText('Jan')).not.toHaveClass('text-blue-600');
        unmount();

        render(<GolfBookingCard booking={booking({ status: 'cancelled' })} />);
        expect(screen.getByText('Jan')).not.toHaveClass('text-blue-600');
    });

    it('opens the booking\'s own page, where it can be cancelled or its receipt read', () => {
        render(<GolfBookingCard booking={booking()} />);
        expect(screen.getByRole('link', { name: /View booking/ })).toHaveAttribute('href', '/golf/bookings/CG-ABC234');
    });

    it('is marked as golf, so it is not mistaken for a hotel in a mixed list', () => {
        render(<GolfBookingCard booking={booking()} />);
        expect(screen.getByText('Golf')).toBeInTheDocument();
    });
});
