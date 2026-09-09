import React from 'react';
import { dayOffset } from '@/utils/flight-utils';

/**
 * The `+1` on an arrival that lands after midnight.
 *
 * A collapsed summary gives two clocks and no date, so `6:40 PM – 6:30 AM` reads as a
 * flight that lands before it takes off. This is the only thing on such a row that says
 * otherwise, which is why it belongs beside the clock rather than below it.
 *
 * Renders nothing for a same-day arrival — an unmarked clock already means "today".
 */
export function ArrivalDayOffset({ from, to }: { from?: string; to?: string }) {
    const days = dayOffset(from, to);
    if (days <= 0) return null;

    return (
        <sup className="ml-0.5 align-super text-[0.6em] font-semibold leading-none text-slate-500 dark:text-slate-400">
            {`+${days}`}
        </sup>
    );
}

export default ArrivalDayOffset;
