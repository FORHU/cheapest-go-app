/**
 * The /golf search form's state (CONTEXT.md, "All-in price"). Client-safe and pure: the page, the
 * form and the tests read the same rules. Anything that does not parse is dropped rather than
 * raised, so a stale or hand-edited URL still renders a page.
 */

export const DEFAULT_PLAYERS = 2;
/** Tee-time chips shown per course for the chosen date. */
export const CHIPS_PER_COURSE = 4;

export interface GolfSearchParams {
    country?: string;
    /** Course-local calendar date, YYYY-MM-DD. */
    date?: string;
    players: number;
    /** Course-local time of day, HH:MM. */
    from?: string;
    to?: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function one(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

export function isValidDate(value: string): boolean {
    if (!DATE.test(value)) return false;
    const d = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function parseSearchParams(raw: Record<string, string | string[] | undefined>): GolfSearchParams {
    const date = one(raw.date)?.trim();
    const from = one(raw.from)?.trim();
    const to = one(raw.to)?.trim();
    const players = Number(one(raw.players));
    const country = one(raw.country)?.trim();
    const validFrom = from && TIME.test(from) ? from : undefined;
    const validTo = to && TIME.test(to) ? to : undefined;
    // An inverted window matches nothing; ignore both ends rather than show an empty page.
    const inverted = validFrom && validTo && validTo < validFrom;
    return {
        country: country || undefined,
        date: date && isValidDate(date) ? date : undefined,
        players: Number.isInteger(players) && players >= 1 && players <= 4 ? players : DEFAULT_PLAYERS,
        from: inverted ? undefined : validFrom,
        to: inverted ? undefined : validTo,
    };
}

/** The query string for a search, omitting defaults so shared links stay short. */
export function searchQuery(params: Partial<GolfSearchParams>): string {
    const q = new URLSearchParams();
    if (params.country) q.set('country', params.country);
    if (params.date) q.set('date', params.date);
    if (params.players && params.players !== DEFAULT_PLAYERS) q.set('players', String(params.players));
    if (params.from) q.set('from', params.from);
    if (params.to) q.set('to', params.to);
    const s = q.toString();
    return s ? `?${s}` : '';
}

/** The earlier and later dates nearest to `date` that appear in `available`, closest first. */
export function nearestDates(date: string, available: string[]): string[] {
    const unique = [...new Set(available)].filter(d => d !== date).sort();
    const before = unique.filter(d => d < date).slice(-1);
    const after = unique.filter(d => d > date).slice(0, 1);
    return [...before, ...after];
}
