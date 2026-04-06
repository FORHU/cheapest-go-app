import { getCustomersList, getAdminSettings } from '@/lib/server/admin';
import { CustomersClient } from './CustomersClient';

export const dynamic = 'force-dynamic';

export default async function AdminCustomersPage() {
    const [customers, settings] = await Promise.all([
        getCustomersList(),
        getAdminSettings(),
    ]);

    return <CustomersClient initialCustomers={customers} defaultCurrency={(settings.default_currency as string) || 'USD'} />;
}
