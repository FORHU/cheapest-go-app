"use client";

import React from 'react';

/**
 * Renders children only after the component has mounted on the client.
 * Use this to wrap components that:
 *   - Use usePathname(), useState, or any browser-only API
 *   - Use Framer Motion layoutId or animate props
 *   - Would cause hydration mismatches due to browser extensions
 *     injecting attributes (bis_skin_checked, bis_register, etc.)
 */
export function ClientOnly({
    children,
    fallback = null,
}: {
    children: React.ReactNode;
    fallback?: React.ReactNode;
}) {
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return <>{fallback}</>;
    return <>{children}</>;
}
