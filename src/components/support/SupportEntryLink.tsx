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
        // breaks their build. The fallback is /help, which is where a reader who is not
        // signed in is going anyway — and during prerender nobody is.
        <Suspense fallback={<a href="/help" className={className}>{label}</a>}>
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

    // Signed out, and already on /help — the only place where the next step really is to
    // sign in, because the articles are what is on screen and a person is what is being
    // asked for. The redirect brings them back here afterwards.
    //
    // Everywhere else, /help. Sending someone straight to a sign-in form because they
    // reached for support answers a question they did not ask: most of what support is
    // asked is on that page, and a visitor who cannot sign in — locked out, or without an
    // account at all — otherwise has no route to anything.
    if (pathname === '/help') {
        const params = new URLSearchParams();
        const query = searchParams?.toString();
        params.set('redirect', '/help' + (query ? `?${query}` : ''));
        return (
            <a href={`/login?${params.toString()}`} className={className}>
                {label}
            </a>
        );
    }

    return (
        <a href="/help" className={className}>
            {label}
        </a>
    );
}
