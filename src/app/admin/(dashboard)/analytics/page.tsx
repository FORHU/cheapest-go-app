import React from 'react';
import { AnalyticsClient } from './AnalyticsClient';
import { getAdvancedAnalytics } from '@/lib/server/admin';

export default async function AdminAnalyticsPage() {
    const data = await getAdvancedAnalytics();

    return (
        <AnalyticsClient data={data} />
    );
}
