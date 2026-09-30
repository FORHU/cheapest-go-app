import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import en from '@/locales/en.json';
import type { GolfCourse } from '@/lib/schemas/golf';
import { GolfCourseCard } from './GolfCourseCard';
import { TeeTimeButton } from './TeeTimeButton';
import { useSupportWidgetStore } from '@/stores/supportWidgetStore';

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
    imageUrls: [], amenities: [], status: 'published',
};

beforeEach(() => useSupportWidgetStore.setState({ isOpen: false }));

describe('GolfCourseCard', () => {
    it('links to the course and states its facts', () => {
        render(<GolfCourseCard course={course} />);
        expect(screen.getByRole('link')).toHaveAttribute('href', '/golf/wack-wack-east-manila');
        expect(screen.getByText('Wack Wack East')).toBeInTheDocument();
        expect(screen.getByText('18 holes · Par 72')).toBeInTheDocument();
        expect(screen.getByText('Green fees from $85')).toBeInTheDocument();
    });

    it('says nothing about price when there is none', () => {
        render(<GolfCourseCard course={{ ...course, greenFeeFrom: null, par: null }} />);
        expect(screen.getByText('18 holes')).toBeInTheDocument();
        expect(screen.queryByText(/green fees/i)).not.toBeInTheDocument();
    });
});

describe('TeeTimeButton', () => {
    it('opens the support chat', () => {
        render(<TeeTimeButton />);
        fireEvent.click(screen.getByRole('button', { name: 'Ask about tee times' }));
        expect(useSupportWidgetStore.getState().isOpen).toBe(true);
    });
});
