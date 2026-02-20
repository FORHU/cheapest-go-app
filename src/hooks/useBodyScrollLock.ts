import { useEffect, useLayoutEffect } from 'react';

// Use layout effect for immediate locking to prevent initial flash/scroll
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function useBodyScrollLock(isLocked: boolean): void {
    useIsomorphicLayoutEffect(() => {
        if (!isLocked) return;

        // Save original overflow style
        const originalStyle = window.getComputedStyle(document.body).overflow;

        // Prevent scrolling
        document.body.style.overflow = 'hidden';

        // Re-enable scrolling when component unmounts or isLocked changes
        return () => {
            document.body.style.overflow = originalStyle;
        };
    }, [isLocked]);
}
