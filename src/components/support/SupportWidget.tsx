'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { SupportLauncher } from './SupportLauncher';
import { SupportPanel } from './SupportPanel';

/**
 * The Support Widget: a floating launcher and the panel it opens.
 *
 * Mounted once in the customer layout, so it follows people through search, a property,
 * checkout and their trips rather than living only on the landing page. Support is needed
 * most at checkout and least on the hero.
 *
 * Rendered through a portal so no ancestor's `overflow` or `transform` can clip a fixed
 * element — the landing page has several of both.
 */

export function SupportWidget() {
    const [mounted, setMounted] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    // `document` exists only after hydration; a portal on the server would not match.
    useEffect(() => setMounted(true), []);

    if (!mounted) return null;

    return createPortal(
        <>
            {isOpen && <SupportPanel onClose={() => setIsOpen(false)} />}

            {/*
              * Hidden while the panel is up, rather than turned into a second close
              * button. Two controls announcing themselves as "Close support" is ambiguous
              * to anyone navigating by name — and under `sm` the panel is full-screen, so
              * a launcher behind it would be unreachable anyway.
              */}
            {!isOpen && <SupportLauncher unread={0} onOpen={() => setIsOpen(true)} />}
        </>,
        document.body,
    );
}
