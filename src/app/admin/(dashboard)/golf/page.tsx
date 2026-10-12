import { listCoursesForAdmin } from '@/lib/server/golf/courses';
import { countPendingCourseRequests } from '@/lib/server/golf/courseRequests';
import { GolfCoursesClient } from './GolfCoursesClient';

export const dynamic = 'force-dynamic';

/** Golf Courses in the admin. The dashboard layout already refuses anyone who is not an admin. */
export default async function AdminGolfPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const params = await searchParams;
    const q = typeof params.q === 'string' ? params.q : '';
    const page = typeof params.page === 'string' ? parseInt(params.page, 10) : 1;
    const [data, pendingRequests] = await Promise.all([listCoursesForAdmin({ q, page }), countPendingCourseRequests()]);
    return <GolfCoursesClient data={data} q={q} pendingRequests={pendingRequests} />;
}
