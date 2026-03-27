import { useEffect, useLayoutEffect } from 'react';

// Use layout effect for immediate locking to prevent initial flash/scroll
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function useBodyScrollLock(isLocked: boolean): void {
    useIsomorphicLayoutEffect(() => {
        if (!isLocked) return;

        const scrollY = window.scrollY;
        const originalOverflow = document.body.style.overflow;
        const originalPosition = document.body.style.position;
        const originalTop = document.body.style.top;
        const originalWidth = document.body.style.width;

        // iOS Safari requires position:fixed to truly prevent background scroll
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.top = `-${scrollY}px`;
        document.body.style.width = '100%';

        return () => {
            document.body.style.overflow = originalOverflow;
            document.body.style.position = originalPosition;
            document.body.style.top = originalTop;
            document.body.style.width = originalWidth;
            // Restore scroll position without visual jump
            window.scrollTo(0, scrollY);
        };
    }, [isLocked]);
}
