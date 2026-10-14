import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import en from '@/locales/en.json';
import ja from '@/locales/ja.json';

const intl = vi.hoisted(() => ({ locale: 'en' }));

vi.mock('next-intl', () => ({
    useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
        let node: any = intl.locale === 'ja' ? ja : en;
        for (const part of `${namespace}.${key}`.split('.')) node = node?.[part];
        if (typeof node !== 'string') return `${namespace}.${key}`;
        return node.replace(/\{(\w+)\}/g, (_: string, name: string) => String(values?.[name] ?? ''));
    },
    useLocale: () => intl.locale,
}));
vi.mock('@/stores/searchStore', () => ({ useUserCurrency: () => 'USD' }));
vi.mock('next/dynamic', () => ({
    default: () => ({ booking, onClose }: { booking: { id: string }; onClose: () => void }) => (
        <div role="dialog" aria-label="map">{booking.id}<button onClick={onClose}>close map</button></div>
    ),
}));
const modals = vi.hoisted(() => ({ cancelOpen: vi.fn(), modifyOpen: vi.fn() }));
vi.mock('./CancellationModal', () => ({
    default: ({ isOpen }: { isOpen: boolean }) => { modals.cancelOpen(isOpen); return isOpen ? <div role="dialog" aria-label="cancel" /> : null; },
}));
vi.mock('./ModificationModal', () => ({
    default: ({ isOpen }: { isOpen: boolean }) => { modals.modifyOpen(isOpen); return isOpen ? <div role="dialog" aria-label="modify" /> : null; },
}));

import BookingCard from './BookingCard';

const DAY = 86_400_000;
const NOW = Date.now();
const iso = (offsetDays: number) => new Date(NOW + offsetDays * DAY).toISOString();

const hotel = (over: Record<string, unknown> = {}) => ({
    id: 'h1', property_name: 'Shangri-La Makati', property_image: null, room_name: 'Deluxe King',
    check_in: iso(10), check_out: iso(12), guests_adults: 2, guests_children: 0,
    total_price: 24000, currency: 'USD', status: 'confirmed', cancellation_policy: 'Free until 3 days before',
    policy_type: 'free_cancellation', created_at: iso(-3), ...over,
}) as never;

beforeEach(() => { vi.clearAllMocks(); intl.locale = 'en'; });

describe('BookingCard (hotel)', () => {
    it('shows the property, the stay, the guests, the room and what was paid', () => {
        render(<BookingCard booking={hotel()} />);
        expect(screen.getByRole('article', { name: 'Shangri-La Makati' })).toBeInTheDocument();
        expect(screen.getByText('2 nights')).toBeInTheDocument();
        expect(screen.getByText('2 adults')).toBeInTheDocument();
        expect(screen.getByText('Deluxe King')).toBeInTheDocument();
        expect(screen.getByText('Free cancellation')).toBeInTheDocument();
        expect(screen.getByTestId('card-money')).toHaveTextContent('24,000');
        expect(screen.getByText('Confirmed')).toBeInTheDocument();
    });

    it('counts children and a single night in the singular', () => {
        render(<BookingCard booking={hotel({ check_out: iso(11), guests_adults: 1, guests_children: 1 })} />);
        expect(screen.getByText('1 night')).toBeInTheDocument();
        expect(screen.getByText('1 adult, 1 child')).toBeInTheDocument();
    });

    it('has no photograph? It falls back to the neutral lead, not a gradient', () => {
        const { container } = render(<BookingCard booking={hotel()} />);
        expect(container.innerHTML).not.toMatch(/purple/);
    });

    it('opens details and the receipt', () => {
        render(<BookingCard booking={hotel()} />);
        expect(screen.getByRole('link', { name: /Details/ })).toHaveAttribute('href', '/trips/h1');
        expect(screen.getByRole('link', { name: /Download receipt/ })).toHaveAttribute('href', '/trips/invoice/h1?type=hotel');
    });

    it('offers modify and cancel on an upcoming confirmed stay, each opening its dialog', () => {
        render(<BookingCard booking={hotel()} />);
        fireEvent.click(screen.getByRole('button', { name: /Modify/ }));
        expect(screen.getByRole('dialog', { name: 'modify' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));
        expect(screen.getByRole('dialog', { name: 'cancel' })).toBeInTheDocument();
    });

    it('does not offer them once the stay has started or when it is cancelled', () => {
        const { unmount } = render(<BookingCard booking={hotel({ check_in: iso(-5), check_out: iso(-3) })} />);
        expect(screen.queryByRole('button', { name: /Modify/ })).toBeNull();
        expect(screen.getByText('Trip completed')).toBeInTheDocument();
        unmount();

        render(<BookingCard booking={hotel({ status: 'cancelled' })} />);
        expect(screen.queryByRole('button', { name: /Modify/ })).toBeNull();
        expect(screen.getByTestId('card-money').querySelector('p')).toHaveClass('line-through');
    });

    it('offers a refund retry when the refund failed', () => {
        render(<BookingCard booking={hotel({ status: 'cancelled_refund_failed' })} />);
        fireEvent.click(screen.getByRole('button', { name: /Retry refund/ }));
        expect(screen.getByRole('dialog', { name: 'cancel' })).toBeInTheDocument();
    });

    it('opens the map', () => {
        render(<BookingCard booking={hotel()} />);
        fireEvent.click(screen.getByRole('button', { name: /Map/ }));
        const map = screen.getByRole('dialog', { name: 'map' });
        expect(within(map).getByText('h1')).toBeInTheDocument();
    });

    it("writes the stay in the reader's language, not English with a Japanese label", () => {
        intl.locale = 'ja';
        render(<BookingCard booking={hotel()} />);
        // A Japanese date carries the month and day characters; the en-US one does not.
        expect(screen.getByTestId('card-money').closest('article')!.textContent).toMatch(/月/);
        expect(screen.getByTestId('card-money').closest('article')!.textContent).not.toMatch(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/);
    });

    it('names its state with the translated vocabulary the rest of the page uses', () => {
        intl.locale = 'ja';
        render(<BookingCard booking={hotel({ status: 'cancelled_refund_failed' })} />);
        expect(screen.getByText(ja.trips.status.refundFailed)).toBeInTheDocument();
        expect(screen.queryByText('Refund Failed')).toBeNull();
    });

    it('sets receipt and map as quiet links, and keeps change and cancel as the boxed actions', () => {
        render(<BookingCard booking={hotel()} />);
        const links = screen.getByTestId('card-links');
        expect(within(links).getByRole('link', { name: /Download receipt/ })).toBeInTheDocument();
        expect(within(links).getByRole('button', { name: /Map/ })).toBeInTheDocument();
        expect(within(links).queryByRole('button', { name: /Modify|^Cancel$/ })).toBeNull();
    });

    it('drains the colour from a cancelled stay\'s photograph, so it reads as inert', () => {
        render(<BookingCard booking={hotel({ status: 'cancelled', property_image: '/hotel.jpg' })} />);
        expect(screen.getByRole('img', { name: 'Shangri-La Makati' })).toHaveClass('grayscale');
    });

    it('keeps a live stay\'s photograph in colour', () => {
        render(<BookingCard booking={hotel({ property_image: '/hotel.jpg' })} />);
        expect(screen.getByRole('img', { name: 'Shangri-La Makati' })).not.toHaveClass('grayscale');
    });
});
