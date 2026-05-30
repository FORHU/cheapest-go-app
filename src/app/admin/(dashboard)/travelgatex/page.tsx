export const dynamic = 'force-dynamic';

import { getProviderIntegrations } from '@/lib/server/admin/providers';
import { TravelgateXAdminClient } from './TravelgateXAdminClient';

export const metadata = {
    title: 'TravelgateX (OTV) | Admin – CheapestGo',
};

export default async function AdminTravelgateXPage() {
    const integrations = await getProviderIntegrations();
    return <TravelgateXAdminClient data={integrations.travelgatex} />;
}
