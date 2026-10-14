/**
 * The photograph and heading over each course-portal page, matched on the whole path (the
 * admin's last-segment lookup would mistake `/course/tee-sheet` for something else the day a
 * section is named like an admin one). The picture is a CC0 photograph kept in `public/`, so
 * the portal does not depend on a third party being up.
 */

export type CourseBannerKey = 'requests' | 'tee-sheet' | 'profile';

const IMAGE = '/images/course-portal-banner.jpg';

export function courseBannerKey(pathname: string): CourseBannerKey {
    if (pathname.startsWith('/course/tee-sheet')) return 'tee-sheet';
    if (pathname === '/course/profile' || pathname.startsWith('/course/profile/')) return 'profile';
    return 'requests';
}

export const COURSE_BANNER_IMAGE = IMAGE;
