import { getCustomersList, getAdminSettings } from '@/lib/server/admin';
import { CustomersClient } from './CustomersClient';

export const dynamic = 'force-dynamic';

export default async function AdminCustomersPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const params = await searchParams;
    const page = Math.max(1, Number(params.page) || 1);

    const [customersPage, settings] = await Promise.all([
        getCustomersList({ page }),
        getAdminSettings(),
    ]);

    return (
        <CustomersClient
            initialCustomers={customersPage.customers}
            defaultCurrency={(settings.default_currency as string) || 'USD'}
            page={customersPage.page}
            totalPages={customersPage.totalPages}
            total={customersPage.total}
        />
    );
}
