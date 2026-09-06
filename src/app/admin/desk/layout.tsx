import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';
import { canStaffSupport } from '@/lib/auth/roles';
import { DeskShell } from './DeskShell';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Support desk | CheapestGo',
    robots: { index: false, follow: false },
};

/**
 * The Support Desk.
 *
 * A sibling of the (dashboard) group rather than a page inside it, so it gets its own
 * chrome while staying under /admin — which means the middleware's session guard already
 * covers it and there is no prefix list to remember to extend.
 *
 * The role check is repeated here rather than inherited: a layout in another route group
 * does not run for this one, and "it is under /admin" only proves a cookie exists.
 */
export default async function DeskLayout({ children }: { children: React.ReactNode }) {
    const { user } = await getSession();

    if (!user) redirect('/login?redirect=/admin/desk');
    if (!canStaffSupport(user.role)) redirect('/');

    // The top bar reads the person from the client store, which a hard refresh onto the
    // desk leaves empty. Handing it down here is what the admin layout does, and without
    // it an Agent is greeted as "Guest User" on their own console.
    const profile = {
        role: user.role,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        avatar: user.avatarUrl,
    };

    return <DeskShell profile={profile}>{children}</DeskShell>;
}
