'use client';

import { Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useSupportWidgetStore } from '@/stores/supportWidgetStore';

/**
 * The way into support for someone who is not signed in.
 *
 * Every major travel seller keeps support reachable before sign-in, and the reason is
 * sharper than convention: "I cannot sign in" is itself a support request, and a channel
 * that requires signing in is the one channel that can never receive it. With the floating
 * launcher gone and the entry point inside the account menu, that was exactly the hole
 * left behind — a visitor stuck at checkout, or locked out, saw nothing at all.
 *
 * Signed in, this opens the panel in place. Signed out, it goes to sign-in and comes back
 * to the page they were on, rather than opening a conversation nobody can answer: a Support
 * Chat is answered in the app and `notify.ts` is a doorbell to the team, not mail to the
 * customer, so a guest who closes the tab is unreachable. That is what ADR-0032 exists to
 * prevent, and routing to sign-in honours it without pretending support is unavailable.
 *
 * It is a link in both cases, not a button dressed as one: the signed-out path is a real
 * navigation, and a control that is sometimes a link and sometimes not is worse to use with
 * a keyboard than one that is consistently either.
 */
export function SupportEntryLink({ className, label }: { className?: string; label: string }) {
    return (
        // The boundary lives here, not at the call site.
        //
        // `useSearchParams` in a client component requires a Suspense boundary above it, or
        // the whole route bails out of static generation — and this renders inside the
        // Footer, which is itself used as a Suspense *fallback*, and a fallback renders
        // outside the boundary it belongs to. That combination failed the AirangGo image
        // build on an unrelated page, `/booking/hotel-confirmed`, which is exactly how hard
        // this is to attribute from the error.
        //
        // Owning the boundary means no caller can place this component somewhere that
        // breaks their build. The fallback is the same link without the redirect: during
        // prerender there is no query string to preserve anyway.
        <Suspense fallback={<a href="/login" className={className}>{label}</a>}>
            <SupportEntry className={className} label={label} />
        </Suspense>
    );
}

function SupportEntry({ className, label }: { className?: string; label: string }) {
    const user = useAuthStore(s => s.user);
    const openSupport = useSupportWidgetStore(s => s.open);
    const pathname = usePathname();
    const searchParams = useSearchParams();

    if (user) {
        return (
            <button type="button" onClick={() => openSupport()} className={className}>
                {label}
            </button>
        );
    }

    // Come back to where they were. Someone who reached for support from a property page
    // has a question about that property, and landing them on the home page afterwards
    // loses it.
    const params = new URLSearchParams();
    const query = searchParams?.toString();
    if (pathname && pathname !== '/' && pathname !== '/login') {
        params.set('redirect', pathname + (query ? `?${query}` : ''));
    }
    const href = params.toString() ? `/login?${params.toString()}` : '/login';

    return (
        <a href={href} className={className}>
            {label}
        </a>
    );
}
