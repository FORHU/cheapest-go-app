import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ScrollToTop } from './ScrollToTop';

/**
 * The scroll-to-top button and the Support Widget's launcher (SupportLauncher.tsx) both
 * live in the bottom-right corner. The launcher is a 56px bubble at `sm:bottom-6 right-6`,
 * so its top edge is 80px above the viewport bottom. This button is z-50 and the launcher
 * z-40, so when their footprints overlap the arrow paints straight over the bubble — which
 * is what `lg:bottom-8` (32px) used to do. It has to stack clear of the launcher.
 */

function scrollPast(y: number) {
    act(() => {
        Object.defineProperty(window, 'scrollY', { value: y, configurable: true, writable: true });
        fireEvent.scroll(window);
    });
}

describe('ScrollToTop', () => {
    afterEach(() => {
        Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true });
    });

    it('stays hidden near the top of the page', () => {
        render(<ScrollToTop />);

        expect(screen.queryByRole('button', { name: /scroll to top/i })).not.toBeInTheDocument();
    });

    it('appears once the page is scrolled past the fold', () => {
        render(<ScrollToTop />);

        scrollPast(400);

        expect(screen.getByRole('button', { name: /scroll to top/i })).toBeInTheDocument();
    });

    it('stacks above the support launcher rather than on top of it', () => {
        render(<ScrollToTop />);
        scrollPast(400);

        const button = screen.getByRole('button', { name: /scroll to top/i });

        // 32px off the bottom lands the arrow inside the launcher's 56px bubble.
        expect(button.className).not.toMatch(/lg:bottom-8(?!\d)/);
        // Cleared: 96px sits a comfortable gap above the launcher's 80px top edge.
        expect(button.className).toContain('sm:bottom-24');
        // ...and share the launcher's right margin so the two line up as a stack.
        expect(button.className).toContain('sm:right-6');
    });
});
