/**
 * The photograph and heading over each course-portal page, matched on the whole path (the
 * admin's last-segment lookup would mistake `/course/tee-sheet` for something else the day a
 * section is named like an admin one). The picture is a CC0 photograph kept in `public/`, so
 * the portal does not depend on a third party being up.
 */

export type CourseBannerKey = 'requests' | 'tee-sheet';

const IMAGE = '/images/course-portal-banner.jpg';

export function courseBannerKey(pathname: string): CourseBannerKey {
    return pathname.startsWith('/course/tee-sheet') ? 'tee-sheet' : 'requests';
}

export const COURSE_BANNER_IMAGE = IMAGE;
