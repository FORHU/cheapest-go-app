"use client";

import { useEffect, useCallback } from 'react';

/**
 * Hook that listens for a specific keyboard key
 */
export const useKeyPress = (
    targetKey: string,
    callback: () => void,
    enabled = true
): void => {
    const handleKeyPress = useCallback(
        (event: KeyboardEvent) => {
            if (event.key === targetKey) {
                callback();
            }
        },
        [targetKey, callback]
    );

    useEffect(() => {
        if (!enabled) return;

        document.addEventListener('keydown', handleKeyPress);
        return () => document.removeEventListener('keydown', handleKeyPress);
    }, [handleKeyPress, enabled]);
};
