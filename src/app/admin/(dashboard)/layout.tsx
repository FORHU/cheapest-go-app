export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminLayoutClient } from './AdminLayoutClient';
import { getSession } from '@/lib/auth/session';
import { canAdminister, canStaffSupport } from '@/lib/auth/roles';

export const metadata: Metadata = {
    title: 'Admin | CheapestGo',
    robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    const { user } = await getSession();

    if (!user) {
        redirect('/login?redirect=/admin');
    }

    if (!canAdminister(user.role)) {
        // A Support Agent is staff, not a customer — send them to the console they can
        // actually use rather than bouncing them onto the marketing site with no
        // explanation. Anyone else goes home.
        redirect(canStaffSupport(user.role) ? '/admin/desk' : '/');
    }

    const userProfile = {
        role: user.role,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        avatar: user.avatarUrl,
    };

    return <AdminLayoutClient profile={userProfile}>{children}</AdminLayoutClient>;
}
