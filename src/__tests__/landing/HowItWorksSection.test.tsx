import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HowItWorksSection } from '@/components/landing/sections/HowItWorksSection';

describe('HowItWorksSection', () => {
    it('renders exactly 3 steps', () => {
        render(<HowItWorksSection />);
        const steps = screen.getAllByRole('listitem');
        expect(steps).toHaveLength(3);
    });

    it('includes Search, Compare, and Book step titles', () => {
        render(<HowItWorksSection />);
        expect(screen.getByRole('heading', { name: /search/i })).toBeTruthy();
        expect(screen.getByRole('heading', { name: /compare/i })).toBeTruthy();
        expect(screen.getByRole('heading', { name: /book/i })).toBeTruthy();
    });

    it('renders a section heading at h2 level', () => {
        render(<HowItWorksSection />);
        expect(screen.getByRole('heading', { level: 2 })).toBeTruthy();
    });
});
