import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PopularDestinationsSection } from '@/components/landing/sections/PopularDestinationsSection';
import { POPULAR_DESTINATIONS } from '@/lib/constants/destinations';

describe('PopularDestinationsSection', () => {
    it('renders all destination city names', () => {
        render(<PopularDestinationsSection />);
        for (const d of POPULAR_DESTINATIONS) {
            expect(screen.getAllByText(d.city).length).toBeGreaterThanOrEqual(1);
        }
    });

    it('renders no price text', () => {
        const { container } = render(<PopularDestinationsSection />);
        expect(container.textContent).not.toMatch(/\$[\d,]+/);
        expect(container.textContent).not.toMatch(/USD|PHP|per night/i);
    });

    it('each card links to /?destination=<city> with no date params', () => {
        render(<PopularDestinationsSection />);
        const links = screen.getAllByRole('link');
        expect(links.length).toBeGreaterThanOrEqual(POPULAR_DESTINATIONS.length);
        for (const link of links) {
            const href = link.getAttribute('href') ?? '';
            expect(href).toMatch(/^\/?(\?destination=|$)/);
            expect(href).not.toMatch(/checkin|checkout|check_in|check_out/i);
        }
    });

    it('renders a section heading', () => {
        render(<PopularDestinationsSection />);
        expect(screen.getByRole('heading')).toBeTruthy();
    });
});
