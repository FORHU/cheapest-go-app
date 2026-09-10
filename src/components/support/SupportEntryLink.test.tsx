import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SupportEntryLink } from './SupportEntryLink';
import { useSupportWidgetStore } from '@/stores/supportWidgetStore';
import { useAuthStore } from '@/stores/authStore';

/**
 * The signed-out route into support.
 *
 * The behaviour worth pinning is the fork: a signed-in customer opens the panel where they
 * stand, and a signed-out one is sent to sign in rather than into a conversation nobody can
 * answer. Getting that backwards produces the failure ADR-0032 exists to prevent — an Agent
 * replying to someone who left no way to be reached.
 */

let pathname = '/property/123';
let search = new URLSearchParams('checkin=2026-10-10');

vi.mock('next/navigation', () => ({
    usePathname: () => pathname,
    useSearchParams: () => search,
}));

beforeEach(() => {
    pathname = '/property/123';
    search = new URLSearchParams('checkin=2026-10-10');
    useSupportWidgetStore.setState({ isOpen: false });
    useAuthStore.setState({ user: null } as never);
});
afterEach(() => vi.restoreAllMocks());

describe('SupportEntryLink', () => {
    it('sends a signed-out visitor to sign in, not into a chat', () => {
        render(<SupportEntryLink label="Support" />);

        const link = screen.getByRole('link', { name: 'Support' });
        expect(link.getAttribute('href')).toContain('/login');
        // The panel must not open: a guest conversation is one an Agent answers into a void.
        expect(useSupportWidgetStore.getState().isOpen).toBe(false);
    });

    it('brings them back to the page they asked from', () => {
        // Someone reaching for support from a property page has a question about that
        // property. Returning them to the home page loses it.
        render(<SupportEntryLink label="Support" />);

        const href = screen.getByRole('link', { name: 'Support' }).getAttribute('href') ?? '';
        expect(href).toContain('redirect=');
        expect(decodeURIComponent(href)).toContain('/property/123?checkin=2026-10-10');
    });

    it('does not ask to be returned to the home page or to login itself', () => {
        pathname = '/';
        render(<SupportEntryLink label="Support" />);
        expect(screen.getByRole('link', { name: 'Support' }).getAttribute('href')).toBe('/login');
    });

    it('opens the panel in place for a signed-in customer', () => {
        useAuthStore.setState({ user: { id: 'u1', email: 'a@b.c' } } as never);
        render(<SupportEntryLink label="Support" />);

        // A button, not a link: the panel is a portal over the current page, so there is
        // nothing to navigate to.
        fireEvent.click(screen.getByRole('button', { name: 'Support' }));
        expect(useSupportWidgetStore.getState().isOpen).toBe(true);
    });
});
