import { getCustomersList } from '@/lib/server/adminActions';
import { CustomersClient } from './CustomersClient';

export const dynamic = 'force-dynamic';

export default async function AdminCustomersPage() {
    const customers = await getCustomersList();

    return <CustomersClient initialCustomers={customers} />;
}
