import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { UsersManagementClient } from './UsersManagementClient';
import type { AdminUserRecord } from '@/lib/server/admin/users';

/**
 * Giving somebody a role.
 *
 * This screen used to be a two-state toggle: you were an admin or you were not, and the
 * button said Promote or Demote accordingly. A third role breaks that in a way that is
 * easy to paper over and hard to notice — "Promote to Admin" on a button that makes
 * somebody a Support Agent is a lie the admin only discovers afterwards.
 *
 * So the tests here are mostly about naming: the screen must say the role it is about to
 * give, count Support Agents as their own thing, and let you filter for them.
 */

const record = (over: Partial<AdminUserRecord> = {}): AdminUserRecord => ({
    id: 'u1',
    email: 'ada@example.com',
    fullName: 'Ada Lovelace',
    role: 'user',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
});

/** The number on a summary card, found by the card's title. */
function statValue(title: string): string {
    const label = screen.getByText(title);
    const card = label.closest('div.relative');
    return card?.querySelector('h3')?.textContent ?? '';
}

describe('UsersManagementClient', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('offers Support Agent alongside the other two roles', () => {
        render(<UsersManagementClient initialUsers={[record()]} />);

        const picker = screen.getByRole('combobox', { name: 'Role for ada@example.com' });
        const offered = within(picker).getAllByRole('option').map(o => o.textContent);

        expect(offered).toEqual(['Standard User', 'Administrator', 'Support Agent']);
    });

    it('names the change by the role being given, not as a promotion', () => {
        render(<UsersManagementClient initialUsers={[record()]} />);

        fireEvent.change(screen.getByRole('combobox', { name: 'Role for ada@example.com' }), {
            target: { value: 'support_agent' },
        });

        expect(screen.getByRole('heading', { name: /support agent/i })).toBeInTheDocument();
        expect(screen.queryByText(/promote to admin/i)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /make support agent/i })).toBeInTheDocument();
    });

    it('says what a Support Agent actually gets, which is the desk and nothing else', () => {
        render(<UsersManagementClient initialUsers={[record()]} />);

        fireEvent.change(screen.getByRole('combobox', { name: 'Role for ada@example.com' }), {
            target: { value: 'support_agent' },
        });

        expect(screen.getByText(/support desk/i)).toBeInTheDocument();
    });

    it('treats dropping a Support Agent to Standard User as taking access away', () => {
        render(<UsersManagementClient initialUsers={[record({ role: 'support_agent' })]} />);

        fireEvent.change(screen.getByRole('combobox', { name: 'Role for ada@example.com' }), {
            target: { value: 'user' },
        });

        expect(screen.getByRole('heading', { name: /standard user/i })).toBeInTheDocument();
        expect(screen.getByText(/lose/i)).toBeInTheDocument();
    });

    it('counts Support Agents apart from Standard Users', () => {
        render(<UsersManagementClient initialUsers={[
            record({ id: 'a', email: 'a@x.com', role: 'admin' }),
            record({ id: 'b', email: 'b@x.com', role: 'support_agent' }),
            record({ id: 'c', email: 'c@x.com', role: 'user' }),
            record({ id: 'd', email: 'd@x.com', role: 'user' }),
        ]} />);

        expect(statValue('Administrators')).toBe('1');
        expect(statValue('Support Agents')).toBe('1');
        expect(statValue('Standard Users')).toBe('2');
    });

    it('keeps the roles readable while a change is in flight', async () => {
        // The picker used to relabel every option "Updating…" during the request, which
        // left a listbox of three identically named choices for anyone reading it aloud.
        vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));

        render(<UsersManagementClient initialUsers={[record()]} />);
        fireEvent.change(screen.getByRole('combobox', { name: 'Role for ada@example.com' }), {
            target: { value: 'admin' },
        });
        fireEvent.click(screen.getByRole('button', { name: /make administrator/i }));

        const picker = await screen.findByRole('combobox', { name: 'Role for ada@example.com' });
        expect(picker).toBeDisabled();
        expect(within(picker).getAllByRole('option').map(o => o.textContent))
            .toEqual(['Standard User', 'Administrator', 'Support Agent']);
        expect(screen.getByText(/updating/i)).toBeInTheDocument();
    });

    it('filters the list down to Support Agents', () => {
        render(<UsersManagementClient initialUsers={[
            record({ id: 'b', email: 'agent@x.com', fullName: 'Grace Hopper', role: 'support_agent' }),
            record({ id: 'c', email: 'customer@x.com', fullName: 'Alan Turing', role: 'user' }),
        ]} />);

        fireEvent.click(screen.getByRole('button', { name: 'Support Agent' }));

        expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
        expect(screen.queryByText('Alan Turing')).not.toBeInTheDocument();
    });
});
