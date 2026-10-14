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
    | 'not_found' | 'wrong_status' | 'not_cancellable' | 'free_cancellation_ended'
    | 'extras_unavailable' | 'currency_unsupported' | 'price_changed';

const HTTP_STATUS: Record<GolfBookingErrorCode, number> = {
    extras_unavailable: 409,
    currency_unsupported: 400,
    price_changed: 409,
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

/** Published means bookable: publishing needs a time zone and at least one tee-time schedule. */
export class CourseNotBookableError extends Error {
    constructor() {
        super('Add a time zone and at least one tee-time schedule before publishing this course.');
        this.name = 'CourseNotBookableError';
    }
}

/** Tee times were generated on the course's clock, so it cannot change while schedules exist. */
export class TimezoneLockedError extends Error {
    constructor() {
        super("This course has tee-time schedules, so its time zone can't change. Delete its schedules first.");
        this.name = 'TimezoneLockedError';
    }
}

/** A published course must stay bookable, so its last schedule cannot go. */
export class LastScheduleError extends Error {
    constructor() {
        super("This is the course's last schedule. Unpublish the course before deleting it.");
        this.name = 'LastScheduleError';
    }
}

/** An image list named an uploaded photo that is not this course's (or does not exist). */
export class PhotoNotOwnedError extends Error {
    constructor() {
        super("One of those photos isn't this course's. Upload it again.");
        this.name = 'PhotoNotOwnedError';
    }
}

export type PhotoRejectedCode = 'empty' | 'too_large' | 'unsupported_type' | 'too_many';

const PHOTO_REJECTED: Record<PhotoRejectedCode, { status: number; message: string }> = {
    empty: { status: 400, message: 'That file is empty.' },
    too_large: { status: 413, message: 'Photos must be 5 MB or smaller.' },
    unsupported_type: { status: 415, message: 'Use a JPEG, PNG or WebP image.' },
    too_many: { status: 409, message: 'This course has reached its photo limit. Remove some before adding more.' },
};

/** An uploaded photo refused for a reason the person can fix. */
export class PhotoRejectedError extends Error {
    constructor(public readonly code: PhotoRejectedCode) {
        super(PHOTO_REJECTED[code].message);
        this.name = 'PhotoRejectedError';
    }

    get httpStatus(): number {
        return PHOTO_REJECTED[this.code].status;
    }
}

export type CourseStaffErrorCode =
    | 'user_not_found' | 'course_not_found' | 'not_eligible' | 'invalid_email'
    | 'invitation_invalid' | 'wrong_account'
    | 'request_pending' | 'request_not_found' | 'request_decided';

const STAFF_HTTP_STATUS: Record<CourseStaffErrorCode, number> = {
    user_not_found: 404,
    course_not_found: 404,
    not_eligible: 409,
    invalid_email: 400,
    invitation_invalid: 410,
    wrong_account: 403,
    request_pending: 409,
    request_not_found: 404,
    request_decided: 409,
};

/** A course-staff step refused for a reason the person or the admin can act on. */
export class CourseStaffError extends Error {
    constructor(
        public readonly code: CourseStaffErrorCode,
        message: string,
        public readonly detail: Record<string, unknown> = {},
    ) {
        super(message);
        this.name = 'CourseStaffError';
    }

    get httpStatus(): number {
        return STAFF_HTTP_STATUS[this.code];
    }
}
