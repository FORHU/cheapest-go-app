/**
 * Class strings the golf form controls share, so the date picker, the dropdown and the party-size
 * control read as one family: small muted label over a ruled field, a surface popover with a
 * hairline border. Tokens come from `.golf-theme` (globals.css).
 */

export const fieldLabelClass = 'block text-xs font-medium text-g-muted';

export const fieldTriggerClass =
    'mt-1 flex w-full min-w-0 items-center justify-between gap-2 rounded-none border-0 border-b border-g-rule bg-transparent px-0 py-1.5 text-left text-base text-g-ink transition-colors hover:border-g-ink focus-visible:border-g-accent disabled:cursor-not-allowed disabled:opacity-50';

export const popoverClass =
    'g-pop absolute left-0 top-full z-30 mt-2 border border-g-rule bg-g-surface shadow-[0_18px_36px_-20px_rgba(15,23,42,0.35)] dark:shadow-[0_18px_40px_-18px_rgba(0,0,0,0.7)]';
