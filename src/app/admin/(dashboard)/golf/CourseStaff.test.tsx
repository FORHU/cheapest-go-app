import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CourseStaff } from './CourseStaff';
import { toast } from 'sonner';

const listing = {
    success: true,
    data: {
        staff: [{ userId: 'u1', email: 'ana@club.test', name: 'Ana Cruz', since: '2026-10-01T00:00:00.000Z' }],
        invitations: [
            { id: 'i1', courseId: 'c1', email: 'ben@club.test', state: 'pending', expiresAt: '2026-10-19T00:00:00.000Z', createdAt: '2026-10-12T00:00:00.000Z' },
            { id: 'i2', courseId: 'c1', email: 'old@club.test', state: 'expired', expiresAt: '2026-09-01T00:00:00.000Z', createdAt: '2026-08-25T00:00:00.000Z' },
        ],
    },
};

const fetchMock = vi.fn();

beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
        new Response(JSON.stringify(init?.method === 'POST' ? { success: true } : listing)));
    vi.stubGlobal('fetch', fetchMock);
});

const post = () => fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST') as [string, RequestInit];

describe('CourseStaff', () => {
    it('lists the people attached and the invitations, with their state', async () => {
        render(<CourseStaff courseId="c1" courseName="Mine GC" />);
        expect(await screen.findByText('Ana Cruz')).toBeInTheDocument();
        expect(screen.getByText('ben@club.test')).toBeInTheDocument();
        expect(screen.getByText('pending')).toBeInTheDocument();
        expect(screen.getByText('expired')).toBeInTheDocument();
        // Only a pending invitation can be withdrawn.
        expect(screen.getAllByRole('button', { name: 'Withdraw' })).toHaveLength(1);
    });

    it('invites by email and reloads', async () => {
        render(<CourseStaff courseId="c1" courseName="Mine GC" />);
        await screen.findByText('Ana Cruz');
        fireEvent.change(screen.getByLabelText('Invite by email'), { target: { value: 'Pro-Shop@Club.test' } });
        fireEvent.click(screen.getByRole('button', { name: /send invitation/i }));

        await waitFor(() => expect(post()).toBeTruthy());
        expect(JSON.parse(String(post()[1].body))).toEqual({ action: 'invite', courseId: 'c1', email: 'Pro-Shop@Club.test' });
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Invitation sent to pro-shop@club.test'));
    });

    it('asks before removing someone', async () => {
        render(<CourseStaff courseId="c1" courseName="Mine GC" />);
        fireEvent.click(await screen.findByRole('button', { name: 'Remove ana@club.test' }));
        expect(post()).toBeUndefined();
        fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
        await waitFor(() => expect(post()).toBeTruthy());
        expect(JSON.parse(String(post()[1].body))).toEqual({ action: 'remove', userId: 'u1', courseId: 'c1' });
    });

    it('withdraws a pending invitation', async () => {
        render(<CourseStaff courseId="c1" courseName="Mine GC" />);
        fireEvent.click(await screen.findByRole('button', { name: 'Withdraw' }));
        await waitFor(() => expect(post()).toBeTruthy());
        expect(JSON.parse(String(post()[1].body))).toEqual({ action: 'revoke_invitation', id: 'i1' });
    });

    it('shows the server\'s reason when an invitation cannot be sent', async () => {
        fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
            init?.method === 'POST'
                ? new Response(JSON.stringify({ success: false, error: 'Enter a valid email address' }), { status: 400 })
                : new Response(JSON.stringify(listing)));
        render(<CourseStaff courseId="c1" courseName="Mine GC" />);
        await screen.findByText('Ana Cruz');
        fireEvent.change(screen.getByLabelText('Invite by email'), { target: { value: 'a@b.co' } });
        fireEvent.click(screen.getByRole('button', { name: /send invitation/i }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Enter a valid email address'));
    });
});
