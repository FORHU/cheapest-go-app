import { useEffect, useLayoutEffect } from 'react';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function useBodyScrollLock(isLocked: boolean): void {
    useIsomorphicLayoutEffect(() => {
        if (!isLocked) return;

        const scrollY = window.scrollY;

        // Prevent wheel / keyboard scroll
        const preventScroll = (e: Event) => e.preventDefault();

        // Prevent touchmove scroll (iOS Safari)
        const preventTouch = (e: TouchEvent) => {
            // Allow touch inside the drawer itself (elements with data-scrollable)
            const target = e.target as HTMLElement;
            if (target.closest('[data-scrollable]')) return;
            e.preventDefault();
        };

        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overscrollBehavior = 'none';
        document.documentElement.style.overscrollBehavior = 'none';

        window.addEventListener('wheel', preventScroll, { passive: false });
        window.addEventListener('touchmove', preventTouch, { passive: false });

        return () => {
            document.body.style.overflow = '';
            document.documentElement.style.overflow = '';
            document.body.style.overscrollBehavior = '';
            document.documentElement.style.overscrollBehavior = '';
            window.removeEventListener('wheel', preventScroll);
            window.removeEventListener('touchmove', preventTouch);
            window.scrollTo(0, scrollY);
        };
    }, [isLocked]);
}
