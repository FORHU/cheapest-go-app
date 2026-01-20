"use client";

import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook that detects clicks outside of a referenced element
 */
export const useClickOutside = <T extends HTMLElement>(
    callback: () => void
): React.RefObject<T | null> => {
    const ref = useRef<T | null>(null);

    const handleClick = useCallback(
        (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                callback();
            }
        },
        [callback]
    );

    useEffect(() => {
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [handleClick]);

    return ref;
};
