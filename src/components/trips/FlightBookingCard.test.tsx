import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import en from '@/locales/en.json';

const intl = vi.hoisted(() => ({ locale: 'en' }));

vi.mock('next-intl', () => ({
    useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
        let node: any = en;
        for (const part of `${namespace}.${key}`.split('.')) node = node?.[part];
        if (typeof node !== 'string') return `${namespace}.${key}`;
        return node.replace(/\{(\w+)\}/g, (_: string, name: string) => String(values?.[name] ?? ''));
    },
    useLocale: () => intl.locale,
}));
vi.mock('@/stores/searchStore', () => ({ useUserCurrency: () => 'USD' }));
vi.mock('@/components/common/FormDatePicker', () => ({ FormDatePicker: () => null }));
vi.mock('@/components/flights/FlightItineraryDetails', () => ({ FlightItineraryDetails: () => <div>itinerary</div> }));
vi.mock('@/lib/trips/booking-itinerary', () => ({ bookingToFlightOffer: () => ({}) }));

import FlightBookingCard from './FlightBookingCard';

const DAY = 86_400_000;
const NOW = Date.now();
const at = (days: number, hours = 0) => new Date(NOW + days * DAY + hours * 3_600_000).toISOString();

const flight = (over: Record<string, unknown> = {}) => ({
    id: 'f1', user_id: 'u1', pnr: 'ABC123', provider: 'duffel', total_price: 320, charged_price: 335.5, currency: 'USD',
    trip_type: 'one-way', status: 'ticketed', created_at: at(-2),
    flight_segments: [{
        id: 's1', booking_id: 'f1', origin: 'MNL', destination: 'CEB', airline: '5J', flight_number: '5J123',
        departure: at(7), arrival: at(7, 1.5), segment_index: 0,
    }],
    passengers: [
        { id: 'p1', booking_id: 'f1', first_name: 'Ana', last_name: 'Cruz', seat_number: '12A' },
        { id: 'p2', booking_id: 'f1', first_name: 'Ben', last_name: 'Cruz', seat_number: null },
    ],
    ...over,
}) as never;

beforeEach(() => {
    intl.locale = 'en';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 200 })));
});

describe('FlightBookingCard', () => {
    it('is one card carrying the route, trip type, passengers, reference and seat', () => {
        render(<FlightBookingCard booking={flight()} />);
        expect(screen.getByRole('article', { name: 'MNL → CEB' })).toBeInTheDocument();
        expect(screen.getByText('Flight')).toBeInTheDocument();
        expect(screen.getByText(en.trips.flightBookingCard.tripTypes.oneWay)).toBeInTheDocument();
        expect(screen.getByText('ABC123')).toBeInTheDocument();
        expect(screen.getByText('12A')).toBeInTheDocument();
    });

    it('says where an upcoming ticketed flight stands, and what was paid', () => {
        render(<FlightBookingCard booking={flight()} />);
        expect(screen.getByText(en.trips.flightBookingCard.stateChips.upcomingFlight)).toBeInTheDocument();
        expect(screen.getByTestId('card-money')).toHaveTextContent('336');
    });

    it('links to the trip and its receipt', () => {
        render(<FlightBookingCard booking={flight()} />);
        expect(screen.getByRole('link', { name: en.trips.flightBookingCard.details })).toHaveAttribute('href', '/trips/f1');
        expect(screen.getByRole('link', { name: new RegExp(en.trips.flightBookingCard.receipt) }))
            .toHaveAttribute('href', '/trips/invoice/f1?type=flight');
    });

    it('offers cancelling a cancellable booking, and opens the confirmation', () => {
        render(<FlightBookingCard booking={flight()} />);
        fireEvent.click(screen.getByRole('button', { name: new RegExp(en.trips.flightBookingCard.cancelBooking) }));
        // The modal asks the airline for a quote before it lets anyone confirm.
        expect(fetch).toHaveBeenCalled();
    });

    it('offers no cancel once cancelled, and mutes the amount', () => {
        render(<FlightBookingCard booking={flight({ status: 'cancelled' })} />);
        expect(screen.queryByRole('button', { name: new RegExp(en.trips.flightBookingCard.cancelBooking) })).toBeNull();
        expect(screen.getByText(en.trips.flightBookingCard.stateChips.cancelled)).toBeInTheDocument();
        expect(screen.getByTestId('card-money').querySelector('p')).toHaveClass('line-through');
    });

    it('puts a failed cancellation in front of the traveller with a way to retry', () => {
        render(<FlightBookingCard booking={flight({ status: 'cancel_failed' })} />);
        expect(screen.getByText(en.trips.flightBookingCard.cancellationFailed)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: new RegExp(en.trips.flightBookingCard.retry) })).toBeInTheDocument();
    });

    it('shows what came back for a refunded booking', () => {
        render(<FlightBookingCard booking={flight({ status: 'refunded', refund_amount: 300, refund_currency: 'USD' })} />);
        expect(screen.getByText(en.trips.flightBookingCard.totalRefund)).toBeInTheDocument();
    });

    it("writes the date and times in the reader's language, not always English", () => {
        intl.locale = 'ja';
        render(<FlightBookingCard booking={flight()} />);
        const card = screen.getByRole('article');
        expect(card.textContent).toMatch(/月/);
        expect(card.textContent).not.toMatch(/(AM|PM)/);
    });

    it('lets the itinerary bar run the full width of the card, with no leftover column', () => {
        const { container } = render(<FlightBookingCard booking={flight()} />);
        expect(container.querySelector('[class*="w-[220px]"]')).toBeNull();
    });

    it('sets the receipt as a quiet link and the details as the one primary action', () => {
        render(<FlightBookingCard booking={flight()} />);
        const links = screen.getByTestId('card-links');
        expect(links).toContainElement(screen.getByRole('link', { name: new RegExp(en.trips.flightBookingCard.receipt) }));
        expect(links).not.toContainElement(screen.getByRole('link', { name: en.trips.flightBookingCard.details }));
    });

    it('has no purple left in it', () => {
        const { container } = render(<FlightBookingCard booking={flight({ status: 'refund_pending' })} />);
        expect(container.innerHTML).not.toMatch(/purple|violet/);
    });
});
