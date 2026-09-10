'use client';

import type { UrgencyView } from '@/app/admin/(dashboard)/support/types';

/**
 * How close this customer is to travelling, as one glanceable word.
 *
 * Only `high` and `critical` are coloured. A queue where every row wears a badge is a queue
 * with no badges — the eye stops separating them — so `normal` shows nothing at all and
 * `low` is muted. What remains coloured is exactly what an Agent should look at first.
 *
 * The label says what is true of the *trip*, not how the conversation was graded: "today"
 * and "this week" are facts an Agent can act on, where "P1" would need translating back
 * into the thing it stands for.
 */

const STYLE: Record<UrgencyView, { label: string; className: string } | null> = {
    // Nothing to draw. The absence is the signal: this one can wait its turn.
    normal: null,
    low: {
        label: 'Not urgent',
        className: 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400',
    },
    high: {
        label: 'This week',
        className: 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
    },
    critical: {
        label: 'Travelling now',
        className: 'bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-200',
    },
};

export function UrgencyBadge({
    urgency,
    overridden = false,
}: {
    urgency: UrgencyView;
    /** True when an Agent set this rather than the dates. Marked so nobody reads it as a fact about the trip. */
    overridden?: boolean;
}) {
    const style = STYLE[urgency];
    if (!style) return null;

    return (
        <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${style.className}`}
            title={
                overridden
                    ? 'Set by an Agent, overriding the travel dates'
                    : 'From the linked booking’s travel dates'
            }
        >
            {style.label}
            {/*
              * A dot, not the word "manual": the badge is read at a glance in a list, and a
              * second word doubles its width for information most rows do not carry.
              */}
            {overridden && <span aria-label="set by an Agent">•</span>}
        </span>
    );
}
