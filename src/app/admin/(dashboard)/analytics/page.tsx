import React from 'react';
import { AnalyticsClient } from './AnalyticsClient';
import { getAdvancedAnalytics } from '@/lib/server/adminActions';

export default async function AdminAnalyticsPage() {
    const data = await getAdvancedAnalytics();

    return (
        <AnalyticsClient data={data} />
    );
}
