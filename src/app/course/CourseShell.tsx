'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { StaffShell } from '@/components/admin/StaffShell';
import type { User } from '@/types/auth';
import { COURSE_BANNER_IMAGE, courseBannerKey } from './banner';
import { CourseMobileNav } from './CourseMobileNav';
import { CourseSideNav } from './CourseSideNav';

/**
 * The course portal's chrome: the staff frame the admin and the Support Desk share, with the
 * portal's own short menu (requests, tee sheet, the way back to the site).
 */
export function CourseShell({
    children,
    profile,
    waiting,
}: {
    children: React.ReactNode;
    profile?: Partial<User>;
    /** Requests waiting for this person's courses, for the menu badge. */
    waiting: number;
}) {
    const pathname = usePathname();
    const tPortal = useTranslations('golf.staff.portal');
    const tSheet = useTranslations('golf.staff.sheet');
    const key = courseBannerKey(pathname);

    const banner = key === 'tee-sheet'
        ? { title: tSheet('title'), subtitle: tSheet('subtitle'), image: COURSE_BANNER_IMAGE }
        : { title: tPortal('title'), subtitle: tPortal('subtitle'), image: COURSE_BANNER_IMAGE };

    return (
        <StaffShell
            profile={profile}
            sectionLabel={tPortal('title')}
            topNavVariant="course"
            banner={banner}
            nav={({ isCollapsed, onNavigate }) => (
                <CourseSideNav pathname={pathname} waiting={waiting} isCollapsed={isCollapsed} onNavigate={onNavigate} />
            )}
            mobileNav={<CourseMobileNav pathname={pathname} waiting={waiting} />}
        >
            {children}
        </StaffShell>
    );
}
