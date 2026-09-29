/**
 * A searched date written out in full for the page's locale — "October 1, 2026".
 *
 * The date is a calendar day with no time zone, so it is formatted in UTC: read as
 * local midnight it would print the day before anywhere west of Greenwich. Anything
 * that is not a YYYY-MM-DD day is returned as it came.
 */
export function searchDateLabel(isoDate: string, locale: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
    if (!m) return isoDate;
    const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(date);
}
