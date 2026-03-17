export const dynamic = 'force-dynamic';

import { getSuppliersList } from '@/lib/server/admin';
import { SuppliersClient } from './SuppliersClient';

export default async function AdminSuppliersPage() {
    const suppliers = await getSuppliersList();
    return <SuppliersClient initialSuppliers={suppliers} />;
}
