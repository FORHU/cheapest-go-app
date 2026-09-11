'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSupportWidgetStore } from '@/stores/supportWidgetStore';
import { SupportPanel } from './SupportPanel';
import { useSupportChat } from './useSupportChat';

/**
 * The Support Widget: the panel, and nothing that opens it.
 *
 * Mounted once in the customer layout, so it follows people through search, a property,
 * checkout and their trips rather than living only on the landing page. Support is needed
 * most at checkout and least on the hero.
 *
 * Rendered through a portal so no ancestor's `overflow` or `transform` can clip a fixed
 * element — the landing page has several of both.
 *
 * There is no longer a floating launcher. Support is entered from the account menu, under
 * Account Settings, which puts it where a signed-in customer already goes to deal with
 * their own affairs and takes a permanently floating button off every page.
 *
 * The trade-off is deliberate and worth knowing, because it reverses part of ADR-0032:
 * that decision kept the launcher visible to signed-out visitors — "hiding it would make
 * support look absent" — and had it open a sign-in prompt. With the entry point inside the
 * account menu, a signed-out visitor has no route to support at all. Since a Support Chat
 * requires an account anyway, what they lose is the invitation rather than the capability;
 * if support ever needs to be visible before signing in, this is the file that hid it.
 */

export function SupportWidget() {
    const [mounted, setMounted] = useState(false);

    /*
     * Open/closed lives in a store rather than here, because the launcher is not the only
     * way in: Account → Help offers "Live Chat", and that row renders in a different
     * subtree from this portal. The conversation still lives in the hook below.
     */
    const isOpen = useSupportWidgetStore((s) => s.isOpen);
    const open = useSupportWidgetStore((s) => s.open);
    const close = useSupportWidgetStore((s) => s.close);

    /*
     * The conversation lives here, not in the panel.
     *
     * The panel unmounts when it is closed, so a hook inside it would take the live stream
     * with it — and then a reply arriving while the bubble is shut could never be counted.
     * Held here, the connection survives closing and the launcher can show what came in.
     */
    const chat = useSupportChat(isOpen);

    // `document` exists only after hydration; a portal on the server would not match.
    useEffect(() => setMounted(true), []);

    if (!mounted) return null;

    return createPortal(
        <>{isOpen && <SupportPanel chat={chat} onClose={close} />}</>,
        document.body,
    );
}
