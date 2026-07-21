export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminLayoutClient } from './AdminLayoutClient';
import { getSession } from '@/lib/auth/session';

export const metadata: Metadata = {
    title: 'Admin | CheapestGo',
    robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    const { user } = await getSession();

    if (!user) {
        redirect('/login?redirect=/admin');
    }

    if (user.role !== 'admin') {
        redirect('/');
    }

    const userProfile = {
        role: user.role,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        avatar: user.avatarUrl,
    };

    return <AdminLayoutClient profile={userProfile}>{children}</AdminLayoutClient>;
}
