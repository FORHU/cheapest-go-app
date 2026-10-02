import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import en from '@/locales/en.json';
import SearchModeToggle from './SearchModeToggle';

vi.mock('next-intl', () => ({
    useTranslations: (namespace: string) => (key: string) => {
        let node: any = en;
        for (const part of `${namespace}.${key}`.split('.')) node = node?.[part];
        return typeof node === 'string' ? node : `${namespace}.${key}`;
    },
}));

describe('SearchModeToggle', () => {
    it('offers golf as a link to the course list, between Flights and AI search', () => {
        const { container } = render(<SearchModeToggle mode="hotels" onModeChange={vi.fn()} />);
        expect(screen.getByRole('link', { name: 'Golf' })).toHaveAttribute('href', '/golf');
        const order = [...container.querySelectorAll('a, button')].map(el => el.textContent);
        expect(order).toEqual(['Stays', 'Flights', 'Golf', 'AI Search']);
    });

    it('still switches search modes with the other tabs', () => {
        const onModeChange = vi.fn();
        render(<SearchModeToggle mode="hotels" onModeChange={onModeChange} />);
        fireEvent.click(screen.getByRole('button', { name: 'Flights' }));
        expect(onModeChange).toHaveBeenCalledWith('flights');
    });
});
