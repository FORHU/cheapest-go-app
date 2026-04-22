export const dynamic = 'force-dynamic';

import { getProviderIntegrations } from '@/lib/server/admin/providers';
import { DuffelAdminClient } from './DuffelAdminClient';

export const metadata = {
    title: 'Duffel Integration | Admin – CheapestGo',
};

export default async function AdminDuffelPage() {
    const integrations = await getProviderIntegrations();
    return <DuffelAdminClient data={integrations.duffel} />;
}
