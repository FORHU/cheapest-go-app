export const dynamic = 'force-dynamic';

import React from 'react';
import { AnalyticsClient } from './AnalyticsClient';
import { getAdvancedAnalytics, getApiLogs } from '@/lib/server/admin';

export default async function AdminAnalyticsPage() {
    const [data, apiLogs] = await Promise.all([
        getAdvancedAnalytics(),
        getApiLogs(),
    ]);

    return (
        <AnalyticsClient data={data} apiLogs={apiLogs} />
    );
}
