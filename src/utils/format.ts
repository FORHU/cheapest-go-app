/**
 * Formatting utilities for the application.
 */

/**
 * Formats duration in minutes to a human-readable string (e.g., "1 hr 15 min").
 */
export const formatDuration = (mins: number): string => {
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
};
