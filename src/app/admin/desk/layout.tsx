import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';
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
    if (user.role !== 'admin') redirect('/');

    return <DeskShell>{children}</DeskShell>;
}
