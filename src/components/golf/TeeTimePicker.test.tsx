import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import en from '@/locales/en.json';
import { TeeTimePicker } from './TeeTimePicker';

vi.mock('next-intl', () => ({
    useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
        let node: any = en;
        for (const part of `${namespace}.${key}`.split('.')) node = node?.[part];
        if (typeof node !== 'string') return `${namespace}.${key}`;
        return node.replace(/\{(\w+)\}/g, (_: string, name: string) => String(values?.[name] ?? ''));
    },
    useLocale: () => 'en',
}));

const teeTimes = [
    { id: 't1', startsAt: '2026-10-11T23:00:00.000Z', localTime: '07:00', spots: 4, spotsLeft: 4, pricePerPlayer: 2500, currency: 'PHP' },
    { id: 't2', startsAt: '2026-10-11T23:10:00.000Z', localTime: '07:10', spots: 4, spotsLeft: 1, pricePerPlayer: 2500, currency: 'PHP' },
];

const respond = (list: unknown[]) =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data: { timezone: 'Asia/Manila', teeTimes: list } }))));

beforeEach(() => respond(teeTimes));

describe('TeeTimePicker', () => {
    it('asks for tomorrow on the course clock and lists the times', async () => {
        render(<TeeTimePicker slug="wack-wack" today="2026-10-11" />);
        expect(await screen.findByText('07:00')).toBeInTheDocument();
        expect(fetch).toHaveBeenCalledWith('/api/golf/courses/wack-wack/tee-times?date=2026-10-12');
        expect(screen.getByText('4 left', { exact: false })).toBeInTheDocument();
    });

    it('disables times without room for the party and sends the chosen one to checkout', async () => {
        render(<TeeTimePicker slug="wack-wack" today="2026-10-11" />);
        await screen.findByText('07:00');
        expect(screen.getByRole('button', { name: /07:10/ })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: /07:00/ }));
        expect(screen.getByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/golf/wack-wack/book?teeTime=t1&players=2');
    });

    it('says when a date has nothing left', async () => {
        respond([]);
        render(<TeeTimePicker slug="wack-wack" today="2026-10-11" />);
        expect(await screen.findByText(en.golf.booking.none)).toBeInTheDocument();
    });
});
