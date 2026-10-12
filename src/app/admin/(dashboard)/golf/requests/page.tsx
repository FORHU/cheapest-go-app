import { listCourseRequests } from '@/lib/server/golf/courseRequests';
import { listPublishedCourses } from '@/lib/server/golf/courses';
import { GolfRequestsClient } from './GolfRequestsClient';

export const dynamic = 'force-dynamic';

/** Requests to list or claim a course. The dashboard layout already refuses anyone who is not an admin. */
export default async function AdminGolfRequestsPage() {
    const [pending, approved, rejected, courses] = await Promise.all([
        listCourseRequests('pending'),
        listCourseRequests('approved'),
        listCourseRequests('rejected'),
        listPublishedCourses(),
    ]);
    return (
        <GolfRequestsClient
            pending={pending}
            approved={approved}
            rejected={rejected}
            courses={courses.map(c => ({ id: c.id, name: c.name, city: c.city, country: c.country }))}
        />
    );
}
