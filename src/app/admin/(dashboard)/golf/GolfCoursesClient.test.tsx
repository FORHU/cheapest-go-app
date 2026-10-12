import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { AdminCoursePage, AdminGolfCourse } from '@/lib/server/golf/courses';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { GolfCoursesClient } from './GolfCoursesClient';

const draft: AdminGolfCourse = {
    id: 'c1', slug: 'wack-wack', name: 'Wack Wack', country: 'Philippines', city: 'Manila', address: null,
    description: '', holes: 18, par: 72, greenFeeFrom: 85, currency: 'USD', imageUrls: [], amenities: [],
    status: 'draft', timezone: null, freeCancelHours: 48, bookingWindowDays: 60, weatherPolicy: '', yardage: null, yearOpened: null, designer: null, grass: null, bookable: false,
};
const page = (courses: AdminGolfCourse[]): AdminCoursePage => ({ courses, total: courses.length, page: 1, pageSize: 20, totalPages: 1 });

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data: [] }))));
});

describe('GolfCoursesClient', () => {
    it('says which courses customers can book', () => {
        const ready = { ...draft, id: 'c2', name: 'Ready', status: 'published' as const, timezone: 'Asia/Manila', bookable: true };
        render(<GolfCoursesClient data={page([draft, ready])} q="" />);
        expect(screen.getByText('Needs tee times')).toBeInTheDocument();
        expect(screen.getByText('Bookable')).toBeInTheDocument();
    });

    it('opens the tee times window instead of publishing a course that cannot be booked', async () => {
        render(<GolfCoursesClient data={page([draft])} q="" />);
        fireEvent.click(screen.getByRole('button', { name: 'Publish Wack Wack' }));
        expect(await screen.findByText('Tee times · Wack Wack')).toBeInTheDocument();
        expect(screen.getByText('Add a time zone and at least one schedule to publish this course.')).toBeInTheDocument();
        expect(screen.getByLabelText('Time zone')).toBeInTheDocument();
        expect(fetch).not.toHaveBeenCalledWith('/api/admin/golf-courses', expect.anything());
    });
});
