import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Flag, Users } from 'lucide-react';
import {
    BookingCardShell, DateBlock, dangerActionClass, ghostActionClass, primaryActionClass, splitCurrency,
} from './BookingCardShell';

const base = {
    lead: <div>lead</div>,
    typeIcon: Flag,
    typeLabel: 'Golf',
    status: { tone: 'emerald' as const, label: 'Confirmed' },
    title: 'Wack Wack Golf',
};

describe('BookingCardShell', () => {
    it('is one labelled article carrying the type, status and title', () => {
        render(<BookingCardShell {...base} />);
        const card = screen.getByRole('article', { name: 'Wack Wack Golf' });
        expect(within(card).getByText('Golf')).toBeInTheDocument();
        expect(within(card).getByText('Confirmed')).toBeInTheDocument();
    });

    it('lists facts, and the money and actions only when given', () => {
        const { rerender } = render(<BookingCardShell {...base} />);
        expect(screen.queryByTestId('card-money')).toBeNull();

        rerender(
            <BookingCardShell {...base} subtitle="Cebu"
                facts={[{ icon: Users, label: '2 players' }, { label: 'CG-ABC234', mono: true }]}
                money={{ amount: '₱5,200.00' }}
                primary={<a href="/x">View booking</a>}
            />,
        );
        expect(screen.getByText('Cebu')).toBeInTheDocument();
        expect(screen.getByText('2 players')).toBeInTheDocument();
        expect(screen.getByText('CG-ABC234')).toHaveClass('font-mono');
        expect(screen.getByTestId('card-money')).toHaveTextContent('₱5,200.00');
        expect(screen.getByRole('link', { name: 'View booking' })).toBeInTheDocument();
    });

    it('steps money back, struck through, when nothing was charged', () => {
        render(<BookingCardShell {...base} money={{ amount: '₱5,200.00', muted: true }} />);
        expect(screen.getByTestId('card-money').querySelector('p')).toHaveClass('line-through');
    });

    it('uses one status vocabulary: each tone is a tinted, bordered pill', () => {
        for (const tone of ['emerald', 'amber', 'rose', 'slate', 'blue'] as const) {
            const { unmount } = render(<BookingCardShell {...base} status={{ tone, label: `s-${tone}` }} />);
            expect(screen.getByText(`s-${tone}`).className).toMatch(/border/);
            unmount();
        }
    });

    it('lets a long title wrap onto a second line rather than cutting it to one', () => {
        render(<BookingCardShell {...base} title="Shangri-La The Fort, Manila, Bonifacio Global City" />);
        const title = screen.getByRole('heading', { level: 3 });
        expect(title.className).toMatch(/line-clamp-2/);
        expect(title.className).not.toMatch(/\btruncate\b/);
    });

    it('sets the currency symbol smaller than the figure, as the design system asks', () => {
        render(<BookingCardShell {...base} money={{ amount: '₱5,200.00' }} />);
        expect(screen.getByText('₱')).toHaveClass('text-sm');
        expect(screen.getByText('5,200.00')).not.toHaveClass('text-sm');
    });

    it('leaves an amount with a trailing symbol whole, rather than guess', () => {
        render(<BookingCardShell {...base} money={{ amount: '5.200,00 €' }} />);
        expect(screen.getByText('5.200,00 €')).toBeInTheDocument();
    });

    it('sets three tiers of action: one primary, ghost secondaries, quiet links', () => {
        render(
            <BookingCardShell {...base}
                primary={<a href="/d">Details</a>}
                actions={<button>Cancel</button>}
                links={<a href="/r">Receipt</a>}
            />,
        );
        const links = screen.getByTestId('card-links');
        expect(within(links).getByRole('link', { name: 'Receipt' })).toBeInTheDocument();
        // Tertiary links are not boxed buttons.
        expect(within(links).getByRole('link', { name: 'Receipt' }).parentElement).toBe(links);
    });

    it('draws no links row when there are none', () => {
        render(<BookingCardShell {...base} primary={<a href="/d">Details</a>} />);
        expect(screen.queryByTestId('card-links')).toBeNull();
    });

    it('takes the accent on its hairline when pointed at', () => {
        render(<BookingCardShell {...base} />);
        expect(screen.getByRole('article').className).toMatch(/hover:border-blue-300/);
    });

    it('sets the money beside the title, not in a column of its own', () => {
        render(<BookingCardShell {...base} money={{ amount: '$336' }} primary={<a href="/d">Details</a>} />);
        const money = screen.getByTestId('card-money');
        const heading = screen.getByRole('heading', { level: 3 });
        // Same row: one parent holds both the words and the amount.
        expect(money.parentElement).toContainElement(heading);
        expect(screen.getByTestId('card-actions')).not.toContainElement(money);
    });

    it('puts every action in one footer row, with the quiet links at its far end', () => {
        render(
            <BookingCardShell {...base}
                primary={<a href="/d">Details</a>}
                actions={<button>Cancel</button>}
                links={<a href="/r">Receipt</a>}
            />,
        );
        const footer = screen.getByTestId('card-actions');
        expect(within(footer).getByRole('link', { name: 'Details' })).toBeInTheDocument();
        expect(within(footer).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
        expect(within(footer).getByTestId('card-links')).toBeInTheDocument();
        expect(screen.getByTestId('card-links').className).toMatch(/ml-auto/);
    });

    it('draws no footer when there is nothing to do', () => {
        render(<BookingCardShell {...base} money={{ amount: '$336' }} />);
        expect(screen.queryByTestId('card-actions')).toBeNull();
    });
});

describe('action styles', () => {
    it('share one radius, the design system\'s button radius, at a 44px height', () => {
        for (const cls of [primaryActionClass, ghostActionClass, dangerActionClass]) {
            expect(cls).toMatch(/rounded-xl/);
            expect(cls).toMatch(/min-h-11/);
        }
    });
});

describe('splitCurrency', () => {
    it('splits a leading symbol from the figure', () => {
        expect(splitCurrency('₱5,200.00')).toEqual({ symbol: '₱', figure: '5,200.00' });
        expect(splitCurrency('$336')).toEqual({ symbol: '$', figure: '336' });
        expect(splitCurrency('KRW 123,456')).toEqual({ symbol: 'KRW', figure: '123,456' });
    });

    it('does not split when there is no leading symbol', () => {
        expect(splitCurrency('5.200,00 €')).toBeNull();
        expect(splitCurrency('336')).toBeNull();
        expect(splitCurrency('')).toBeNull();
    });
});

describe('DateBlock', () => {
    it('reads the date on the clock it is given, not the machine\'s', () => {
        // 16:00Z is midnight on the 20th in Manila.
        render(<DateBlock iso="2030-01-19T16:00:00.000Z" timeZone="Asia/Manila" locale="en" />);
        expect(screen.getByText('20')).toBeInTheDocument();
        expect(screen.getByText('Jan')).toBeInTheDocument();
        expect(screen.getByText('Sun')).toBeInTheDocument();
    });

    it('falls back to the viewer\'s clock when there is none', () => {
        render(<DateBlock iso="2030-01-20T12:00:00.000Z" timeZone={null} locale="en" />);
        expect(screen.getByText('20')).toBeInTheDocument();
    });

    it('marks what is still ahead in the accent and what is behind in slate', () => {
        const { rerender } = render(<DateBlock iso="2030-01-20T12:00:00.000Z" timeZone={null} locale="en" tone="upcoming" />);
        expect(screen.getByText('Jan')).toHaveClass('text-blue-600');
        rerender(<DateBlock iso="2030-01-20T12:00:00.000Z" timeZone={null} locale="en" tone="inactive" />);
        expect(screen.getByText('Jan')).not.toHaveClass('text-blue-600');
        expect(screen.getByText('Jan').className).toMatch(/text-slate/);
    });
});
