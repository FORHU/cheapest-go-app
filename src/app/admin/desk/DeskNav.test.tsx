import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeskNav } from './DeskNav';

/**
 * The Support Desk's navigation.
 *
 * The point of the desk is that it is short: an inbox and the hours, and nothing else.
 * These tests are what stops it quietly growing back into the full back office one useful
 * link at a time.
 *
 * It is a workspace, not a boundary — everyone here is a full admin — so the way back to
 * the rest of admin is a plain link, not a hidden one.
 */

describe('DeskNav', () => {
    it('offers the inbox and the hours', () => {
        render(<DeskNav pathname="/admin/desk" waiting={0} />);

        expect(screen.getByRole('link', { name: /support/i })).toHaveAttribute('href', '/admin/desk');
        expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('href', '/admin/desk/settings');
    });

    it('offers nothing else from the back office', () => {
        render(<DeskNav pathname="/admin/desk" waiting={0} />);

        for (const elsewhere of ['Bookings', 'Customers', 'Revenue', 'Stripe', 'Suppliers', 'Users']) {
            expect(screen.queryByRole('link', { name: elsewhere }), elsewhere).not.toBeInTheDocument();
        }
    });

    it('leads back to the full admin, because this hides nothing', () => {
        // Not a locked room. Saying so plainly is better than a short menu that implies
        // a boundary which does not exist.
        render(<DeskNav pathname="/admin/desk" waiting={0} />);

        expect(screen.getByRole('link', { name: /full admin/i })).toHaveAttribute('href', '/admin/overview');
    });

    it('shows how many people are waiting', () => {
        render(<DeskNav pathname="/admin/desk" waiting={4} />);

        expect(screen.getByText('4')).toBeInTheDocument();
    });

    it('shows no count when the queue is empty', () => {
        render(<DeskNav pathname="/admin/desk" waiting={0} />);

        expect(screen.queryByText('0')).not.toBeInTheDocument();
    });

    it('keeps both links reachable when the rail is collapsed', () => {
        // The admin sidebar collapses to icons. Copying that is only safe if the icons
        // still say what they are to a screen reader, which the labels were doing before.
        render(<DeskNav pathname="/admin/desk" waiting={0} isCollapsed />);

        expect(screen.queryByText('Settings')).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Support' })).toHaveAttribute('href', '/admin/desk');
        expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/admin/desk/settings');
    });

    it('still says how many are waiting when collapsed', () => {
        // The number has nowhere to go once the labels are gone, and dropping it would
        // make the collapsed rail the one place a queue can build up unseen.
        render(<DeskNav pathname="/admin/desk" waiting={4} isCollapsed />);

        expect(screen.queryByText('4')).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: /4 waiting/i })).toBeInTheDocument();
    });

    it('marks which page you are on', () => {
        render(<DeskNav pathname="/admin/desk/settings" waiting={0} />);

        expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('aria-current', 'page');
        expect(screen.getByRole('link', { name: /support/i })).not.toHaveAttribute('aria-current');
    });
});
