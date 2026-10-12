'use client';

import { useEffect, useRef, type RefObject } from 'react';

/** Calls `onDismiss` when a pointer goes down outside `ref` while `active`. */
export function useDismiss(ref: RefObject<HTMLElement | null>, active: boolean, onDismiss: () => void) {
    const latest = useRef(onDismiss);
    latest.current = onDismiss;

    useEffect(() => {
        if (!active) return;
        const onPointerDown = (event: PointerEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) latest.current();
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [active, ref]);
}
