'use client';

import { useEffect, useState } from 'react';

/**
 * Returns true after the component has mounted on the client.
 * Use instead of the repeated `const [mounted, setMounted] = useState(false)`
 * pattern to avoid SSR hydration mismatches.
 */
export function useMounted(): boolean {
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);
    return mounted;
}
