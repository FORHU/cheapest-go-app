import { addDays, dayOfWeek } from './time';

/**
 * Month-grid arithmetic for the golf date picker. Pure and client-safe: dates are "YYYY-MM-DD"
 * and months "YYYY-MM", with no zone involved, so a calendar built on the server and one built
 * in the browser agree.
 */

const pad = (n: number) => String(n).padStart(2, '0');

export interface CalendarDay {
    date: string;
    /** False for the leading and trailing days of the neighbouring months. */
    inMonth: boolean;
}

export function monthOf(date: string): string {
    return date.slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** The same day in another month, clamped to that month's length (31 Jan + 1 month = 28 Feb). */
export function shiftMonthKeepingDay(date: string, delta: number): string {
    const month = shiftMonth(monthOf(date), delta);
    const [y, m] = month.split('-').map(Number);
    const length = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${month}-${pad(Math.min(Number(date.slice(8, 10)), length))}`;
}

/**
 * The weeks that cover `month`, whole weeks only (35 or 42 cells), starting on `weekStart`
 * (0 = Sunday … 6 = Saturday).
 */
export function monthGrid(month: string, weekStart = 0): CalendarDay[] {
    const first = `${month}-01`;
    const lead = (dayOfWeek(first) - weekStart + 7) % 7;
    const [y, m] = month.split('-').map(Number);
    const length = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const weeks = Math.ceil((lead + length) / 7);
    const start = addDays(first, -lead);
    return Array.from({ length: weeks * 7 }, (_, i) => {
        const date = addDays(start, i);
        return { date, inMonth: monthOf(date) === month };
    });
}

/** Whether `date` may be chosen given optional inclusive bounds. */
export function isSelectable(date: string, min?: string, max?: string): boolean {
    return (!min || date >= min) && (!max || date <= max);
}

/** `date` moved into [min, max]; unchanged when it is already inside. */
export function clampDate(date: string, min?: string, max?: string): string {
    if (min && date < min) return min;
    if (max && date > max) return max;
    return date;
}
