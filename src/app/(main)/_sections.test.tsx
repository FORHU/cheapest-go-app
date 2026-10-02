import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GolfCourse } from '@/lib/schemas/golf';
import { listNewestPublishedCourses } from '@/lib/server/golf/courses';
import { GolfSectionStream } from './_sections';

vi.mock('@/lib/server/landing/get-landing-data', () => ({ getFlightDeals: vi.fn() }));
vi.mock('@/components/landing/sections', () => ({ DealsSection: () => null }));
vi.mock('@/lib/server/golf/courses', () => ({ listNewestPublishedCourses: vi.fn() }));
vi.mock('@/components/golf/GolfCoursesSection', () => ({ GolfCoursesSection: () => null }));

const listNewest = vi.mocked(listNewestPublishedCourses);

// Braces matter: a function returned from beforeEach runs as teardown, and mockReset returns the mock.
beforeEach(() => { listNewest.mockReset(); });

describe('GolfSectionStream', () => {
    it('hands the four newest courses to the section', async () => {
        const courses = [{ id: 'c1' }] as GolfCourse[];
        listNewest.mockResolvedValue(courses);
        const element = await GolfSectionStream();
        expect(listNewest).toHaveBeenCalledWith(4);
        expect(element?.props).toEqual({ courses });
    });

    it('renders nothing when the query fails, so the home page still renders', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        listNewest.mockRejectedValue(new Error('connection refused'));
        expect(await GolfSectionStream()).toBeNull();
        expect(log).toHaveBeenCalledWith('[Landing] golf_courses error:', 'connection refused');
        log.mockRestore();
    });
});
