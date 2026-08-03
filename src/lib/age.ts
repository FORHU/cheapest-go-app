/**
 * ─── Age rules ────────────────────────────────────────────────────────────────
 *
 * One definition of "how old is this person", shared by account signup and
 * flight passenger validation. Duplicating the arithmetic is how the two drift
 * apart and start disagreeing about the same date of birth.
 */

/** Account holders must be adults — they are entering a payment contract. */
export const MINIMUM_ACCOUNT_AGE = 18;

/** Nobody is older than this; anything beyond it is a typo or a bad parse. */
export const MAXIMUM_HUMAN_AGE = 120;

/**
 * Whole years elapsed between `birthDate` and `on`.
 *
 * Calendar-based, not `(now - then) / msPerYear`: the millisecond form drifts by
 * a day around leap years and reports someone as 18 the day before their
 * birthday. Returns null when the date is unparseable or in the future.
 *
 * @param birthDate ISO date, `YYYY-MM-DD`
 * @param on        Date to measure against (defaults to now)
 */
export function calculateAge(birthDate: string, on: Date = new Date()): number | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate?.slice(0, 10) ?? '');
    if (!match) return null;

    const [, y, m, d] = match;
    const birthYear = Number(y);
    const birthMonth = Number(m);
    const birthDay = Number(d);

    // Reject impossible calendar dates (e.g. 2026-02-30) — Date would roll them over.
    const probe = new Date(Date.UTC(birthYear, birthMonth - 1, birthDay));
    if (
        probe.getUTCFullYear() !== birthYear ||
        probe.getUTCMonth() !== birthMonth - 1 ||
        probe.getUTCDate() !== birthDay
    ) {
        return null;
    }

    let age = on.getUTCFullYear() - birthYear;
    // Not yet had this year's birthday → subtract one.
    const monthDiff = (on.getUTCMonth() + 1) - birthMonth;
    if (monthDiff < 0 || (monthDiff === 0 && on.getUTCDate() < birthDay)) {
        age -= 1;
    }

    return age < 0 ? null : age;
}

/** True when `birthDate` is a plausible date of birth for a living person. */
export function isPlausibleBirthDate(birthDate: string, on: Date = new Date()): boolean {
    const age = calculateAge(birthDate, on);
    return age !== null && age <= MAXIMUM_HUMAN_AGE;
}

/** True when the person is at least `minimum` years old on `on`. */
export function isAtLeastAge(
    birthDate: string,
    minimum: number = MINIMUM_ACCOUNT_AGE,
    on: Date = new Date(),
): boolean {
    const age = calculateAge(birthDate, on);
    return age !== null && age >= minimum;
}

/** `YYYY-MM-DD` for a Date, in UTC. */
function toIsoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
}

/**
 * Latest date of birth that still makes someone `minimum` years old today —
 * i.e. the `max` a date input should accept for an age-gated field.
 *
 * Someone born on exactly this date has their birthday today and qualifies.
 *
 * Leap years are handled by verification rather than arithmetic: subtracting 18
 * from 29 February lands on a date that does not exist, and Date rolls it
 * *forward* to 1 March, which would admit someone a day short of the minimum.
 */
export function latestBirthDateForAge(
    minimum: number = MINIMUM_ACCOUNT_AGE,
    on: Date = new Date(),
): string {
    const candidate = new Date(Date.UTC(
        on.getUTCFullYear() - minimum,
        on.getUTCMonth(),
        on.getUTCDate(),
    ));
    // Step back if the rollover produced someone fractionally too young.
    if ((calculateAge(toIsoDate(candidate), on) ?? -1) < minimum) {
        candidate.setUTCDate(candidate.getUTCDate() - 1);
    }
    return toIsoDate(candidate);
}

/** Earliest date of birth worth accepting — the `min` for a date input. */
export function earliestPlausibleBirthDate(on: Date = new Date()): string {
    return toIsoDate(new Date(Date.UTC(
        on.getUTCFullYear() - MAXIMUM_HUMAN_AGE,
        on.getUTCMonth(),
        on.getUTCDate(),
    )));
}

/**
 * Airline passenger type for a date of birth, evaluated **on the departure
 * date** — not today. A child who turns 12 between booking and travel flies as
 * an adult, and airlines price and board on the travel-date age.
 *
 * Bands follow the common industry convention, which is also Duffel's:
 *   INF  under 2
 *   CHD  2 to 11
 *   ADT  12 and over
 *
 * Individual carriers vary at the edges; this is the default the fare was
 * quoted under, so a mismatch here is what gets corrected at check-in.
 */
export type PassengerType = 'ADT' | 'CHD' | 'INF';

export function passengerTypeForBirthDate(birthDate: string, departureDate: string): PassengerType | null {
    const departure = new Date(`${departureDate.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(departure.getTime())) return null;

    const age = calculateAge(birthDate, departure);
    if (age === null) return null;

    if (age < 2) return 'INF';
    if (age < 12) return 'CHD';
    return 'ADT';
}
