import React from 'react';

/** The resting surface every result card is drawn on: white, 16px corners, a hairline border. */
export const CARD_SURFACE_BASE = 'bg-white dark:bg-slate-900 rounded-2xl border transition-all duration-200';

/** Its border and shadow at rest, and the lift it takes under the pointer. */
export const CARD_SURFACE_IDLE =
    'border-slate-200/70 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 ' +
    'shadow-[0_10px_30px_-14px_rgba(15,23,42,0.14)] hover:shadow-[0_16px_40px_-16px_rgba(15,23,42,0.18)]';

/**
 * A flight result card's surface, whole. The filter panel beside the results wears
 * the same one, so the two read as one set of cards rather than a panel and a list.
 */
export const RESULT_CARD_SURFACE = `${CARD_SURFACE_BASE} ${CARD_SURFACE_IDLE}`;

/** The same surface without the hover lift — for placeholders, which are not interactive. */
export const RESULT_CARD_RESTING = `${CARD_SURFACE_BASE} ${CARD_SURFACE_IDLE
    .split(/\s+/)
    .filter(c => c && !c.includes('hover:'))
    .join(' ')}`;

/** The search page's filter panel, on a result card's surface. */
export function FilterCard({ className = '', children }: { className?: string; children: React.ReactNode }) {
    return <div className={`${RESULT_CARD_SURFACE} w-full p-6 ${className}`}>{children}</div>;
}

export default FilterCard;
