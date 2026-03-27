export const dynamic = 'force-dynamic';

import { getUsersList } from '@/lib/server/admin';
import { UsersManagementClient } from './UsersManagementClient';

export default async function AdminUsersPage() {
    const users = await getUsersList();
    return <UsersManagementClient initialUsers={users} />;
}
