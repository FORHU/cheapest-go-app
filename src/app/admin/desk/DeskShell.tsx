'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { StaffShell } from '@/components/admin/StaffShell';
import { useSupportWaiting } from '@/components/admin/useSupportWaiting';
import type { User } from '@/types/auth';
import { DeskNav } from './DeskNav';
import { DeskMobileNav } from './DeskMobileNav';
import { deskBanner } from './banner';

/**
 * The desk's chrome: the shared staff frame with the desk's own menu.
 *
 * Deliberately the same frame as the full admin — see StaffShell — because an Agent who is
 * also an admin moves between the two consoles all day, and a plainer desk would read as an
 * unfinished corner of the product rather than a workspace built for one job.
 *
 * What is not copied is the contents of the navigation. The desk holds an inbox, the hours,
 * and the way back; the admin's nineteen other sections stay in the admin. Design shared,
 * menu not — that distinction is the whole design.
 */
export function DeskShell({
    children,
    profile,
}: {
    children: React.ReactNode;
    profile?: Partial<User>;
}) {
    const pathname = usePathname();
    const waiting = useSupportWaiting();

    return (
        <StaffShell
            profile={profile}
            sectionLabel="Support desk"
            topNavVariant="desk"
            banner={deskBanner(pathname)}
            nav={({ isCollapsed, onNavigate }) => (
                <DeskNav pathname={pathname} waiting={waiting} isCollapsed={isCollapsed} onNavigate={onNavigate} />
            )}
            mobileNav={<DeskMobileNav pathname={pathname} waiting={waiting} />}
        >
            {children}
        </StaffShell>
    );
}
