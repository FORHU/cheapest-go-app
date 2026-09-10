import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SupportEntryLink } from './SupportEntryLink';
import { useSupportWidgetStore } from '@/stores/supportWidgetStore';
import { useAuthStore } from '@/stores/authStore';

/**
 * The route into support, which is three different routes depending on who is asking and
 * where from.
 *
 * A Support Chat requires an account (ADR-0032), so a signed-out visitor cannot be dropped
 * into one. What they get instead used to be a sign-in form, which answered a question they
 * had not asked and left anyone unable to sign in — locked out, or with no account at all —
 * with no route to anything. Now they get the help articles, and the sign-in is offered
 * there, next to the reason for it.
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
    it('sends a signed-out visitor to the help page, not into a chat', () => {
        render(<SupportEntryLink label="Support" />);

        expect(screen.getByRole('link', { name: 'Support' }).getAttribute('href')).toBe('/help');
        // Never a chat: a guest conversation is one an Agent answers into a void.
        expect(useSupportWidgetStore.getState().isOpen).toBe(false);
    });

    it('does not send them to sign in before they have read anything', () => {
        // The failure this replaces. Reaching for support and being handed a login form
        // reads as "support is unavailable", which is what it amounted to.
        render(<SupportEntryLink label="Support" />);
        expect(screen.getByRole('link', { name: 'Support' }).getAttribute('href')).not.toContain('/login');
    });

    it('offers sign-in once they are already on the help page', () => {
        // Here the articles are on screen and a person is what is being asked for, so the
        // next step really is to sign in — and the redirect brings them back.
        pathname = '/help';
        search = new URLSearchParams();
        render(<SupportEntryLink label="Chat with us" />);

        const href = screen.getByRole('link', { name: 'Chat with us' }).getAttribute('href') ?? '';
        expect(href).toContain('/login');
        expect(decodeURIComponent(href)).toContain('redirect=/help');
    });

    it('opens the panel in place for a signed-in customer, wherever they are', () => {
        // A button, not a link: the panel is a portal over the current page, so there is
        // nothing to navigate to and nothing to lose.
        useAuthStore.setState({ user: { id: 'u1', email: 'a@b.c' } } as never);
        render(<SupportEntryLink label="Support" />);

        fireEvent.click(screen.getByRole('button', { name: 'Support' }));
        expect(useSupportWidgetStore.getState().isOpen).toBe(true);
    });

    it('opens the panel from the help page too, for someone signed in', () => {
        pathname = '/help';
        useAuthStore.setState({ user: { id: 'u1', email: 'a@b.c' } } as never);
        render(<SupportEntryLink label="Chat with us" />);

        fireEvent.click(screen.getByRole('button', { name: 'Chat with us' }));
        expect(useSupportWidgetStore.getState().isOpen).toBe(true);
    });
});
