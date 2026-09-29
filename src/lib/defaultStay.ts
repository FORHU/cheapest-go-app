/**
 * The **Default Stay**: which dates to quote for when nobody has named usable ones.
 *
 * Next Friday to Sunday. Not today, and not tomorrow — OTV holds near-zero inventory for
 * same-day and next-day stays, so a search on those dates comes back empty and reads, to
 * the traveller, exactly like a city where every hotel is full.
 *
 * That is not hypothetical. The two landing sections that link straight into a city both
 * sent `checkIn = today, checkOut = tomorrow`, each with its own inlined copy of the same
 * date helper. Clicking Paris on the home page produced 200-odd hotels and not one
 * bookable room, on every property opened.
 *
 * Dates are built from the local calendar, not from `toISOString()`. A traveller in
 * Manila clicking a card at 09:00 on the 28th is on the 27th in UTC, and a stay quoted
 * for a day that has already passed where they are is the bug this file exists to stop.
 */

/** Friday to Sunday. Also how long a stay gets when the link's checkout is unusable. */
const DEFAULT_NIGHTS = 2;

/** A date as the URL and the supplier both write it, in the traveller's own calendar. */
export function asDay(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The earliest arrival the supplier has anything for: the day after tomorrow. */
export function earliestBookableDay(): string {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return asDay(d);
}

export function defaultStay(): { checkIn: string; checkOut: string } {
    const now = new Date();
    const daysUntilFriday = ((5 - now.getDay() + 7) % 7) || 7;   // never today
    const checkIn = new Date(now);
    checkIn.setDate(now.getDate() + daysUntilFriday);
    const checkOut = new Date(checkIn);
    checkOut.setDate(checkIn.getDate() + DEFAULT_NIGHTS);
    return { checkIn: asDay(checkIn), checkOut: asDay(checkOut) };
}

/**
 * The **Default Departure**: what a flight search asks for when no date was named.
 *
 * A month out, which is where the cheap fares are — deliberately not the Default Stay.
 * The two answer different questions: one is about what OTV has rooms for next weekend,
 * the other about airfare, and quoting next weekend for a flight would point every
 * dateless route at the most expensive departure window there is.
 */
export function defaultDeparture(): string {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return asDay(d);
}

/**
 * The stay a page should actually quote for, given whatever the URL carries.
 *
 * A link that has sat in a chat window for a week names dates in the past; sent on as-is
 * the supplier rejects them and the page reads as though the hotel has no rooms. So a
 * stay that cannot be booked falls back to one that can.
 *
 * `chosen` says whether the traveller named this stay or we did. A Default Stay is
 * disclosed, never silent — a quote nobody asked for, with no sign of where the dates
 * came from, is worse than no quote.
 */
export function resolveStayDates(
    checkIn?: string | null,
    checkOut?: string | null,
): { checkIn: string; checkOut: string; chosen: boolean } {
    const fallback = defaultStay();
    const day = (value?: string | null): string | null => {
        if (!value) return null;
        const t = new Date(value).getTime();
        return Number.isFinite(t) ? value.slice(0, 10) : null;
    };

    const asked = day(checkIn);
    let start = asked ?? fallback.checkIn;
    let end = day(checkOut) ?? fallback.checkOut;

    const rescued = start < earliestBookableDay();
    if (rescued) start = fallback.checkIn;

    // A checkout on or before the arrival is not a stay. Keep the arrival — that part the
    // traveller chose — and give it the default two nights.
    if (end <= start) {
        const pushed = new Date(`${start}T00:00:00`);
        pushed.setDate(pushed.getDate() + DEFAULT_NIGHTS);
        end = asDay(pushed);
    }

    return { checkIn: start, checkOut: end, chosen: asked !== null && !rescued };
}
