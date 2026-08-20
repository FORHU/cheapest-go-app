import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { PopularDestinationsSection } from '@/components/landing/sections/PopularDestinationsSection';
import { POPULAR_DESTINATIONS } from '@/lib/constants/destinations';

const messages = {
    popularDestinations: {
        title: 'Popular Destinations',
        subtitle: 'Explore the world',
    },
};

function Wrapper({ children }: { children: React.ReactNode }) {
    return (
        <NextIntlClientProvider locale="en" messages={messages}>
            {children}
        </NextIntlClientProvider>
    );
}

describe('PopularDestinationsSection', () => {
    it('renders all destination city names', () => {
        render(<PopularDestinationsSection />, { wrapper: Wrapper });
        for (const d of POPULAR_DESTINATIONS) {
            expect(screen.getAllByText(d.city).length).toBeGreaterThanOrEqual(1);
        }
    });

    it('renders no price text', () => {
        const { container } = render(<PopularDestinationsSection />, { wrapper: Wrapper });
        expect(container.textContent).not.toMatch(/\$[\d,]+/);
        expect(container.textContent).not.toMatch(/USD|PHP|per night/i);
    });

    it('each card links to /search with destination, countryCode, checkIn, and checkOut params', () => {
        render(<PopularDestinationsSection />, { wrapper: Wrapper });
        const links = screen.getAllByRole('link');
        expect(links.length).toBeGreaterThanOrEqual(POPULAR_DESTINATIONS.length);
        for (const link of links) {
            const href = link.getAttribute('href') ?? '';
            expect(href).toMatch(/^\/search\?/);
            expect(href).toMatch(/destination=/);
            expect(href).toMatch(/checkIn=\d{4}-\d{2}-\d{2}/);
            expect(href).toMatch(/checkOut=\d{4}-\d{2}-\d{2}/);
        }
    });

    it('renders a section heading', () => {
        render(<PopularDestinationsSection />, { wrapper: Wrapper });
        expect(screen.getByRole('heading')).toBeTruthy();
    });
});
