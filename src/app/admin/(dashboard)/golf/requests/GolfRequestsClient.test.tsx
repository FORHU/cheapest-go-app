import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { CourseRequest } from '@/lib/schemas/golfStaff';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

import { GolfRequestsClient } from './GolfRequestsClient';
import { toast } from 'sonner';

const request = (over: Partial<CourseRequest> = {}): CourseRequest => ({
    id: 'r1', userId: 'u1', status: 'pending', contactName: 'Ana Cruz', contactEmail: 'ana@club.test',
    courseName: 'New Greens', country: 'Philippines', city: 'Cebu', existingCourseId: null, existingCourseName: null,
    message: 'I run the pro shop.', courseId: null, decisionNote: '', createdAt: '2026-10-10T00:00:00.000Z', decidedAt: null, ...over,
});
const courses = [{ id: 'c9', name: 'Wack Wack East', city: 'Manila', country: 'Philippines' }];
const fetchMock = vi.fn();

beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true, data: { createdCourse: true } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
});

const body = () => JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
const page = (over: Partial<Parameters<typeof GolfRequestsClient>[0]> = {}) =>
    render(<GolfRequestsClient pending={[request()]} approved={[]} rejected={[]} courses={courses} {...over} />);

describe('GolfRequestsClient', () => {
    it('shows who is asking, for what, and what they said', () => {
        page();
        expect(screen.getByText('New Greens')).toBeInTheDocument();
        expect(screen.getByText(/Ana Cruz · ana@club\.test/)).toBeInTheDocument();
        expect(screen.getByText('a new listing')).toBeInTheDocument();
        expect(screen.getByText('I run the pro shop.')).toBeInTheDocument();
    });

    it('approves to a new draft course by default, with a note', async () => {
        page();
        fireEvent.change(screen.getByLabelText(/Note to the requester/), { target: { value: 'Welcome.' } });
        fireEvent.click(screen.getByRole('button', { name: /approve/i }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(body()).toEqual({ action: 'approve', id: 'r1', note: 'Welcome.' });
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Approved. A draft course was created.'));
        expect(router.refresh).toHaveBeenCalled();
    });

    it('lets the admin attach the person to a different listed course', async () => {
        page();
        fireEvent.change(screen.getByLabelText('Attach to'), { target: { value: 'c9' } });
        fireEvent.click(screen.getByRole('button', { name: /approve/i }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(body()).toMatchObject({ action: 'approve', id: 'r1', courseId: 'c9' });
    });

    it('names the course being claimed', () => {
        page({ pending: [request({ existingCourseId: 'c9', existingCourseName: 'Wack Wack East' })] });
        expect(screen.getByText('to claim Wack Wack East')).toBeInTheDocument();
    });

    it('rejects', async () => {
        page();
        fireEvent.click(screen.getByRole('button', { name: /reject/i }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(body()).toMatchObject({ action: 'reject', id: 'r1' });
    });

    it('shows the server\'s reason when a decision is refused', async () => {
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'This request has already been decided.' }), { status: 409 }));
        page();
        fireEvent.click(screen.getByRole('button', { name: /approve/i }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('This request has already been decided.'));
        expect(router.refresh).not.toHaveBeenCalled();
    });

    it('lists decided requests on their own tabs, without actions', () => {
        page({ approved: [request({ id: 'r2', status: 'approved', decidedAt: '2026-10-11T00:00:00.000Z', decisionNote: 'Verified.' })] });
        fireEvent.click(screen.getByRole('tab', { name: /approved/i }));
        expect(screen.getByText(/Approved/)).toBeInTheDocument();
        expect(screen.getByText(/Verified\./)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument();
    });
});
