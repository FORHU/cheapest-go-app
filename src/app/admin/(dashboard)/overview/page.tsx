export const dynamic = 'force-dynamic';

import { getDashboardData } from '@/lib/server/admin';
import AdminDashboardClient from './AdminDashboardClient';

export const metadata = {
    title: 'Admin Dashboard | CheapestGo',
    robots: { index: false, follow: false },
};

export default async function OverviewPage() {
    const dashboardData = await getDashboardData();
    return <AdminDashboardClient data={dashboardData} />;
}
