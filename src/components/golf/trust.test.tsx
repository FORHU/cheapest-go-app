import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import en from '@/locales/en.json';
import type { GolfCourse } from '@/lib/schemas/golf';
import type { CourseSearchResult } from '@/lib/server/golf/search';
import { GolfPolicyBlock } from './GolfPolicyBlock';
import { GolfFactBlock } from './GolfFactBlock';
import { GolfSearchForm } from './GolfSearchForm';
import { GolfSearchResultCard } from './GolfSearchResultCard';

vi.mock('next-intl', () => ({
    useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
        let node: any = en;
        for (const part of `${namespace}.${key}`.split('.')) node = node?.[part];
        if (typeof node !== 'string') return `${namespace}.${key}`;
        return node.replace(/\{(\w+)\}/g, (_: string, name: string) => String(values?.[name] ?? ''));
    },
    useLocale: () => 'en',
}));

const course: GolfCourse = {
    id: 'c1', slug: 'wack-wack-east-manila', name: 'Wack Wack East', country: 'Philippines', city: 'Manila',
    address: null, description: '', holes: 18, par: 72, greenFeeFrom: 85, currency: 'USD',
    imageUrls: [], amenities: [], status: 'published', timezone: 'Asia/Manila', freeCancelHours: 48,
    bookingWindowDays: 14, weatherPolicy: '', yardage: 7100, yearOpened: 1930, designer: null, grass: null,
};

describe('GolfPolicyBlock', () => {
    it('states the window, the cancellation cutoff, the refund, the weather and the confirmation promise', () => {
        render(<GolfPolicyBlock windowDays={14} cancel={{ kind: 'hours', hours: 48 }} weatherPolicy="" />);
        const list = within(screen.getByRole('region', { name: /booking rules/i }));
        expect(list.getByText('Tee times open 14 days ahead.')).toBeInTheDocument();
        expect(list.getByText('Free cancellation up to 48 hours before the tee time.')).toBeInTheDocument();
        expect(list.getByText(/refunded to your card in full, service fee included/)).toBeInTheDocument();
        expect(list.getByText(/if the course closes for bad weather, we cancel and refund you in full/)).toBeInTheDocument();
        expect(list.getByText(/only charged once it does/)).toBeInTheDocument();
    });

    it('shows the course\'s own weather rule when it has one, and a dated cutoff for a tee time', () => {
        render(<GolfPolicyBlock cancel={{ kind: 'until', date: 'Oct 12, 2026, 8:00 AM' }} weatherPolicy="Play on in light rain." />);
        expect(screen.getByText('Free cancellation until Oct 12, 2026, 8:00 AM.')).toBeInTheDocument();
        expect(screen.getByText('Weather: Play on in light rain.')).toBeInTheDocument();
        expect(screen.queryByText(/tee times open/i)).not.toBeInTheDocument();
    });

    it('says plainly when the cutoff has passed', () => {
        render(<GolfPolicyBlock cancel={{ kind: 'none' }} weatherPolicy="" />);
        expect(screen.getByText(/can't be cancelled online/)).toBeInTheDocument();
    });
});

describe('GolfFactBlock', () => {
    it('lists the facts the course has and leaves out the rest', () => {
        render(<GolfFactBlock course={course} />);
        expect(screen.getByText('7100 yards')).toBeInTheDocument();
        expect(screen.getByText('1930')).toBeInTheDocument();
        expect(screen.queryByText('Designer')).not.toBeInTheDocument();
        expect(screen.queryByText('Grass')).not.toBeInTheDocument();
    });
});

describe('GolfSearchForm', () => {
    it('is a GET form carrying the current search', () => {
        const { container } = render(<GolfSearchForm params={{ country: 'Japan', date: '2026-10-20', players: 3, from: '07:00' }} />);
        const form = container.querySelector('form')!;
        expect(form).toHaveAttribute('method', 'get');
        expect(form).toHaveAttribute('action', '/golf');
        expect(screen.getByLabelText('Date')).toHaveValue('2026-10-20');
        expect(screen.getByLabelText('Players')).toHaveValue('3');
        expect(container.querySelector('input[name="country"]')).toHaveValue('Japan');
        expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute('href', '/golf?country=Japan');
    });
});

describe('GolfSearchResultCard', () => {
    const allIn = { total: 212.2, perPlayer: 106.1, currency: 'USD' };

    it('shows the all-in price and links each tee time chip to checkout', () => {
        const result: CourseSearchResult = {
            course, matches: true, nearest: [],
            from: { teeTimeId: 't1', startsAt: '2026-10-20T00:00:00.000Z', localTime: '08:00', ...allIn },
            teeTimes: [{ id: 't1', startsAt: '2026-10-20T00:00:00.000Z', localTime: '08:00', spotsLeft: 4, ...allIn }],
        };
        render(<GolfSearchResultCard result={result} params={{ date: '2026-10-20', players: 2 }} />);
        expect(screen.getByText('From $106.10 per player, all-in')).toBeInTheDocument();
        expect(screen.getByText('$212.20 for 2 players')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /08:00/ })).toHaveAttribute('href', '/golf/wack-wack-east-manila/book?teeTime=t1&players=2');
    });

    it('offers the nearest dates when the chosen day has nothing', () => {
        const result: CourseSearchResult = {
            course, matches: false, from: null, teeTimes: [],
            nearest: [{ date: '2026-10-18', ...allIn }, { date: '2026-10-22', ...allIn }],
        };
        render(<GolfSearchResultCard result={result} params={{ date: '2026-10-20', players: 2, from: '07:00' }} />);
        expect(screen.getByText('No tee times on Oct 20, 2026')).toBeInTheDocument();
        const link = screen.getByRole('link', { name: /Oct 18, 2026/ });
        expect(link).toHaveAttribute('href', '/golf?date=2026-10-18&from=07%3A00');
    });
});
