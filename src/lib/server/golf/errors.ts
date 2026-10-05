/** Another course already uses this slug. Kept apart from courses.ts so tests can mock that module. */
export class SlugTakenError extends Error {
    constructor(public readonly slug: string) {
        super(`The slug "${slug}" is already used by another course`);
        this.name = 'SlugTakenError';
    }
}

/** A course with tee-time bookings cannot be deleted; unpublishing hides it instead. */
export class CourseHasBookingsError extends Error {
    constructor() {
        super('This course has tee-time bookings, so it cannot be deleted. Unpublish it instead.');
        this.name = 'CourseHasBookingsError';
    }
}

/** Tee times are set on the course's clock, so a course needs a time zone before it gets a schedule. */
export class CourseNotSchedulableError extends Error {
    constructor() {
        super('Set the course time zone before adding tee-time schedules.');
        this.name = 'CourseNotSchedulableError';
    }
}

export type GolfBookingErrorCode =
    | 'tee_time_unavailable' | 'not_enough_spots' | 'payment_unavailable'
    | 'not_found' | 'wrong_status' | 'not_cancellable' | 'free_cancellation_ended';

const HTTP_STATUS: Record<GolfBookingErrorCode, number> = {
    tee_time_unavailable: 409,
    not_enough_spots: 409,
    payment_unavailable: 502,
    not_found: 404,
    wrong_status: 409,
    not_cancellable: 409,
    free_cancellation_ended: 409,
};

/** A booking step refused for a reason the customer or the team can act on. */
export class GolfBookingError extends Error {
    constructor(
        public readonly code: GolfBookingErrorCode,
        message: string,
        public readonly detail: Record<string, unknown> = {},
    ) {
        super(message);
        this.name = 'GolfBookingError';
    }

    get httpStatus(): number {
        return HTTP_STATUS[this.code];
    }
}
