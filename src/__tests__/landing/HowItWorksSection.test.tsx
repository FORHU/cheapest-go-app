import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { HowItWorksSection } from '@/components/landing/sections/HowItWorksSection';

const messages = {
    landing: {
        howItWorksSteps: {
            howItWorks: 'How It Works',
            book: 'Book your trip',
            bookNext: 'in minutes.',
            search: { title: 'Search', description: 'Search for flights and hotels.' },
            compareStep: { title: 'Compare', description: 'Compare the best deals.' },
            bookStep: { title: 'Book', description: 'Book with confidence.' },
        },
    },
};

function Wrapper({ children }: { children: React.ReactNode }) {
    return (
        <NextIntlClientProvider locale="en" messages={messages}>
            {children}
        </NextIntlClientProvider>
    );
}

describe('HowItWorksSection', () => {
    it('renders exactly 3 steps', () => {
        render(<HowItWorksSection />, { wrapper: Wrapper });
        const steps = screen.getAllByRole('listitem');
        expect(steps).toHaveLength(3);
    });

    it('includes Search, Compare, and Book step titles', () => {
        render(<HowItWorksSection />, { wrapper: Wrapper });
        expect(screen.getByRole('heading', { name: /search/i })).toBeTruthy();
        expect(screen.getByRole('heading', { name: /compare/i })).toBeTruthy();
        expect(screen.getByRole('heading', { name: /book/i })).toBeTruthy();
    });

    it('renders a section heading at h2 level', () => {
        render(<HowItWorksSection />, { wrapper: Wrapper });
        expect(screen.getByRole('heading', { level: 2 })).toBeTruthy();
    });
});
