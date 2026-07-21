export const dynamic = 'force-dynamic';

import { getSuppliersList } from '@/lib/server/admin';
import { getAdminSettings } from '@/lib/server/admin/settings';
import { SuppliersClient } from './SuppliersClient';

export default async function AdminSuppliersPage() {
    const [suppliers, settings] = await Promise.all([
        getSuppliersList(),
        getAdminSettings()
    ]);
    const defaultCurrency = settings.default_currency || 'USD';

    return <SuppliersClient initialSuppliers={suppliers} defaultCurrency={defaultCurrency} />;
}
