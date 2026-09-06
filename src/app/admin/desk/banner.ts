/**
 * The image and title over each desk page.
 *
 * The admin builds its banner by taking the last segment of the path and looking it up in
 * one flat table. That works there because every section is one level deep. It breaks here:
 * `/admin/desk/settings` ends in "settings" and would come back as the platform settings
 * banner — "Configure platform-wide preferences and security" — above a form that sets
 * opening hours and nothing else.
 *
 * So the desk matches on the whole path, and anything it does not recognise falls back to
 * the desk itself rather than to the admin's dashboard.
 */

export interface DeskBanner {
    title: string;
    subtitle: string;
    image: string;
}

const BANNERS: Record<string, DeskBanner> = {
    '/admin/desk': {
        title: 'Support Desk',
        subtitle: 'Answer the people waiting',
        image: 'https://images.unsplash.com/photo-1596526131083-e8c633c948d2?auto=format&fit=crop&q=80&w=1600',
    },
    '/admin/desk/settings': {
        title: 'Support Hours',
        subtitle: 'When a person is available to take over',
        image: 'https://images.unsplash.com/photo-1454165833767-027ff33027ef?auto=format&fit=crop&q=80&w=1600',
    },
};

export function deskBanner(pathname: string): DeskBanner {
    return BANNERS[pathname] ?? BANNERS['/admin/desk'];
}
