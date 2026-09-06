import { isRole, type Role } from '@/lib/auth/roles';
import { getSqlAdmin } from '@/lib/db/postgres';

export interface AdminUserRecord {
    id: string;
    email: string;
    fullName: string;
    role: Role;
    createdAt: string;
}

export async function getUsersList(): Promise<AdminUserRecord[]> {
    const sql = getSqlAdmin();

    const rows = await sql`
        SELECT id, email, role, first_name, last_name, created_at
        FROM users
        ORDER BY created_at DESC
    `;

    return rows.map((u: any) => {
        const first = u.first_name?.trim() || '';
        const last = u.last_name?.trim() || '';
        const fullName = [first, last].filter(Boolean).join(' ') || u.email.split('@')[0];
        return {
            id: u.id,
            email: u.email || '',
            fullName,
            role: isRole(u.role) ? u.role : 'user',
            createdAt: u.created_at,
        };
    });
}
