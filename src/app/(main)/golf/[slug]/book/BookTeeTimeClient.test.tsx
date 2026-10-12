import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import en from '@/locales/en.json';

vi.mock('next-intl', () => ({
    useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
        let node: any = en;
        for (const part of `${namespace}.${key}`.split('.')) node = node?.[part];
        if (typeof node !== 'string') return `${namespace}.${key}`;
        return node.replace(/\{(\w+)\}/g, (_: string, name: string) => String(values?.[name] ?? ''));
    },
}));
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/components/checkout/StripeEmbeddedCheckout', () => ({ default: () => <div>card form</div> }));

import { BookTeeTimeClient } from './BookTeeTimeClient';

const summary = {
    courseName: 'Wack Wack', courseHref: '/golf/wack-wack', date: 'Wednesday, 7 October 2026', time: '07:00 course time',
    greenFeeLabel: 'Green fee (2 × $85.00)', greenFee: '$170.00',
    extraLines: [{ label: 'Club rental × 1', amount: '$45.00' }],
    serviceFee: '$13.09', total: '$228.09',
};
const extras = [
    { code: 'club_rental' as const, name: 'Club rental', each: '$45.00 each', quantity: 1 },
    { code: 'cart' as const, name: 'Golf cart', each: '$25.00 each', quantity: 0 },
];
const fetchMock = vi.fn(async () => new Response(
    JSON.stringify({ success: true, data: { reference: 'CG-ABC234', clientSecret: 'pi_1_secret' } }), { status: 201 }));

beforeEach(() => {
    router.replace.mockClear();
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
});

const page = () => render(
    <BookTeeTimeClient teeTimeId="t1" players={2} bookPath="/golf/wack-wack/book" extras={extras} summary={summary}
        policy={{ cancel: { kind: 'until', date: 'Oct 5, 2026, 7:00 AM' }, weatherPolicy: '' }} />,
);

describe('BookTeeTimeClient', () => {
    it('lists the chosen extras and re-prices on the server when one changes', () => {
        page();
        expect(screen.getByText('Club rental × 1')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('combobox', { name: /Golf cart/ }));
        fireEvent.click(screen.getByRole('option', { name: '1' }));
        expect(router.replace).toHaveBeenCalledWith('/golf/wack-wack/book?teeTime=t1&players=2&extras=club_rental:1,cart:1', { scroll: false });
    });

    it('sends the chosen extras with the hold, then shows the card form', async () => {
        page();
        fireEvent.change(screen.getByLabelText(en.golf.booking.leadName), { target: { value: 'Ana Cruz' } });
        fireEvent.click(screen.getByRole('button', { name: en.golf.booking.continueToPayment }));
        expect(await screen.findByText('card form')).toBeInTheDocument();
        const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(JSON.parse(String(init.body))).toEqual({
            teeTimeId: 't1', players: 2, leadName: 'Ana Cruz', extras: [{ code: 'club_rental', quantity: 1 }],
        });
    });
});
