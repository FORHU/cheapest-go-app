export const dynamic = 'force-dynamic';

import React from 'react';
import { SettingsClient } from './SettingsClient';
import { getAdminSettings, getIntegrationKeys } from '@/lib/server/admin';

export default async function AdminSettingsPage() {
    const [settings, integrationKeys] = await Promise.all([
        getAdminSettings(),
        Promise.resolve(getIntegrationKeys()),
    ]);

    return (
        <SettingsClient
            initialSettings={settings}
            integrationKeys={integrationKeys}
        />
    );
}
