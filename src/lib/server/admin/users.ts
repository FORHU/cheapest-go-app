import { createAdminClient } from '@/utils/supabase/admin';

export interface AdminUserRecord {
    id: string;
    email: string;
    fullName: string;
    role: 'user' | 'admin';
    createdAt: string;
}

export async function getUsersList(): Promise<AdminUserRecord[]> {
    const supabase = createAdminClient();

    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, created_at')
        .order('created_at', { ascending: false });

    if (error || !profiles) {
        console.error('[getUsersList] Error:', error);
        return [];
    }

    return profiles.map((p: any) => ({
        id: p.id,
        email: p.email || '',
        fullName: p.full_name || 'Anonymous',
        role: p.role || 'user',
        createdAt: p.created_at,
    }));
}
