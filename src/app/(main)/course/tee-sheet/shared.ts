/** What a form gets back from asking the server to preview a change. */
export type ReviewResult = { error?: string; fieldErrors?: Record<string, string[] | undefined> };
/** `surface`: show a failure at the top of the page too, for actions that have no form of their own. */
export type Review = (body: Record<string, unknown>, options?: { surface?: boolean }) => Promise<ReviewResult>;

export const inputClass =
    'mt-1 w-full rounded-none border-0 border-b border-g-rule bg-transparent px-0 py-2 text-base tabular-nums text-g-ink transition-colors placeholder:text-g-muted/60 focus:border-g-accent focus:outline-none';

export const labelClass = 'block text-xs font-medium text-g-muted';

export const primaryButton =
    'rounded-sm bg-g-accent px-5 py-2 text-sm font-semibold text-g-accent-ink transition duration-200 hover:bg-g-accent-hover disabled:opacity-60 motion-safe:active:scale-[0.98]';

export const secondaryButton =
    'rounded-sm border border-g-rule px-5 py-2 text-sm font-semibold text-g-ink transition duration-200 hover:border-g-ink disabled:opacity-60 motion-safe:active:scale-[0.98]';

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
