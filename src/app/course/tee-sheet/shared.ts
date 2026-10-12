/** What a form gets back from asking the server to preview a change. */
export type ReviewResult = { error?: string; fieldErrors?: Record<string, string[] | undefined> };
/** `surface`: show a failure at the top of the page too, for actions that have no form of their own. */
export type Review = (body: Record<string, unknown>, options?: { surface?: boolean }) => Promise<ReviewResult>;

/**
 * The admin's idiom, so the portal reads as the same product: boxed inputs, bordered cards,
 * blue primary actions, small semibold headings.
 */
export const cardClass = 'rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]';

export const headingClass = 'text-base font-semibold text-slate-900 dark:text-slate-100';

export const hintClass = 'text-sm text-slate-500 dark:text-slate-400';

export const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm tabular-nums text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-100';

export const labelClass = 'mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300';

export const primaryButton =
    'rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50';

export const secondaryButton =
    'rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5';

export const dangerButton =
    'rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30';

/** A weekday toggle, in the admin's chip idiom: blue when on. */
export function dayChipClass(on: boolean) {
    return `rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${on
        ? 'border-blue-600 bg-blue-600 text-white'
        : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5'}`;
}

/** Times of day on a grid, "05:00" to "19:55" by `step` minutes: the span tee sheets run in. */
export function timeOptions(step: number): { value: string; label: string }[] {
    const out: { value: string; label: string }[] = [];
    for (let m = 5 * 60; m < 20 * 60; m += step) {
        const v = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        out.push({ value: v, label: v });
    }
    return out;
}

/** The grid plus a value that is not on it (a 07:38 first tee), so it still shows as chosen. */
export function withValue(options: { value: string; label: string }[], value: string) {
    return !value || options.some(o => o.value === value)
        ? options
        : [...options, { value, label: value }].sort((a, b) => a.value.localeCompare(b.value));
}
