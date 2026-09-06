import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeskMobileNav } from './DeskMobileNav';

/**
 * The desk's bottom bar on a phone.
 *
 * The admin's bottom bar has four tabs and a "More" sheet holding another nineteen links.
 * Copying that wholesale would undo the entire point of the desk on the one device where
 * a long menu costs the most. So the design is copied and the contents are not: the same
 * bar, with only what the desk has.
 */

describe('DeskMobileNav', () => {
    it('offers the inbox, the hours, and the way back', () => {
        render(<DeskMobileNav pathname="/admin/desk" waiting={0} />);

        expect(screen.getByRole('link', { name: /support/i })).toHaveAttribute('href', '/admin/desk');
        expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('href', '/admin/desk/settings');
        expect(screen.getByRole('link', { name: /full admin/i })).toHaveAttribute('href', '/admin/overview');
    });

    it('offers nothing else from the back office, and no "More" sheet to hide it in', () => {
        render(<DeskMobileNav pathname="/admin/desk" waiting={0} />);

        for (const elsewhere of ['Bookings', 'Customers', 'Revenue', 'Users', 'More']) {
            expect(screen.queryByText(elsewhere), elsewhere).not.toBeInTheDocument();
        }
    });

    it('shows how many people are waiting', () => {
        render(<DeskMobileNav pathname="/admin/desk" waiting={3} />);

        expect(screen.getByLabelText('3 waiting for a reply')).toHaveTextContent('3');
    });

    it('marks which page you are on', () => {
        render(<DeskMobileNav pathname="/admin/desk/settings" waiting={0} />);

        expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('aria-current', 'page');
        expect(screen.getByRole('link', { name: /support/i })).not.toHaveAttribute('aria-current');
    });
});
