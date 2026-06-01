export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminLayoutClient } from './AdminLayoutClient';
import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/utils/postgres/admin';

export const metadata: Metadata = {
    title: 'Admin | CheapestGo',
    robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    const { user } = await getSession();

    if (!user) {
        redirect('/login?redirect=/admin');
    }

    const db = createAdminClient();
    const { data: profile } = await db
        .from('profiles')
        .select('role, full_name, avatar_url')
        .eq('id', user.id)
        .single();

    if (!profile || profile.role !== 'admin') {
        redirect('/');
    }

    const userProfile = {
        role: profile.role,
        firstName: profile.full_name?.split(' ')[0] || '',
        lastName: profile.full_name?.split(' ').slice(1).join(' ') || '',
        avatar: profile.avatar_url,
    };

    return <AdminLayoutClient profile={userProfile}>{children}</AdminLayoutClient>;
}
