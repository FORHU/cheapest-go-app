import { z } from 'zod';
import { isValidTimeZone } from '@/lib/golf/time';
import { GOLF_EXTRAS, type ExtraLine } from '@/lib/golf/extras';
import { HORIZON_DAYS, MAX_BOOKING_WINDOW_DAYS } from '@/lib/golf/rules';

/**
 * Golf (CONTEXT.md, "Golf Course", "Tee Time", "Golf Booking"). Client-safe: types, the input
 * schemas the admin forms, the API and the checkout share, and the slug rule. Queries live in
 * lib/server/golf.
 */

export const GOLF_AMENITIES = [
    'caddie', 'cart', 'driving_range', 'putting_green', 'clubhouse',
    'restaurant', 'club_rental', 'pro_shop', 'lessons', 'night_golf',
] as const;
export type GolfAmenity = (typeof GOLF_AMENITIES)[number];

export const GOLF_HOLES = [9, 18, 27, 36] as const;

export type GolfCourseStatus = 'draft' | 'published';

export interface GolfCourse {
    id: string;
    slug: string;
    name: string;
    country: string;
    city: string;
    address: string | null;
    description: string;
    holes: number;
    par: number | null;
    /** Indicative "from" price for the listing — never a quote. */
    greenFeeFrom: number | null;
    currency: string;
    /** First is the cover. */
    imageUrls: string[];
    amenities: GolfAmenity[];
    status: GolfCourseStatus;
    /** IANA zone the course's tee times are set in; null until an admin sets it. */
    timezone: string | null;
    /** Free cancellation ends this many hours before a tee time. */
    freeCancelHours: number;
    /** Tee times open (and are sold) this many course-local days ahead. */
    bookingWindowDays: number;
    /** What happens in bad weather, in the course's words; '' when it has not said. */
    weatherPolicy: string;
    yardage: number | null;
    yearOpened: number | null;
    designer: string | null;
    grass: string | null;
}

/** Lowercase a-z0-9 words joined by single hyphens; '' when nothing latin survives. */
export function slugify(...parts: string[]): string {
    return parts
        .join(' ')
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120)
        .replace(/-+$/, '');
}

const requiredText = (label: string, max: number) =>
    z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long`);

// ── Photos ───────────────────────────────────────────────────────────────────

const PHOTO_PATH = /^\/golf-photos\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Where an uploaded course photo is served from (the app, not the bucket: ADR-0050). */
export const golfPhotoPath = (id: string) => `/golf-photos/${id}`;

/** The photo id in one of our own photo paths; null for anything else, so it is never guessed at. */
export function golfPhotoIdOf(url: string): string | null {
    return PHOTO_PATH.exec(url)?.[1].toLowerCase() ?? null;
}

/** An https:// link, or one of our own uploaded photos. */
const imageUrlSchema = z.string().trim().superRefine((url, ctx) => {
    if (golfPhotoIdOf(url)) return;
    try {
        new URL(url);
    } catch {
        ctx.addIssue({ code: 'custom', message: 'Not a valid URL' });
        return;
    }
    if (!url.startsWith('https://')) ctx.addIssue({ code: 'custom', message: 'Image URLs must start with https://' });
});

// The fields a course describes itself with, shared by the admin form and the course portal so
// both enforce the same limits. Each caller decides what "missing" means for it.
const profileField = {
    address: z.string().trim().max(300),
    description: z.string().trim().max(10_000),
    par: z.number().int().min(27, 'Par must be between 27 and 144').max(144, 'Par must be between 27 and 144'),
    imageUrls: z.array(imageUrlSchema).max(20, 'At most 20 images'),
    amenities: z.array(z.enum(GOLF_AMENITIES)),
    freeCancelHours: z.number().int().min(0, 'Between 0 and 720 hours').max(720, 'Between 0 and 720 hours'),
    bookingWindowDays: z.number().int().min(1, 'Between 1 and 90 days').max(MAX_BOOKING_WINDOW_DAYS, 'Between 1 and 90 days'),
    weatherPolicy: z.string().trim().max(500, 'At most 500 characters'),
    yardage: z.number().int().min(1000, 'Between 1,000 and 12,000 yards').max(12_000, 'Between 1,000 and 12,000 yards'),
    yearOpened: z.number().int().min(1800, 'Between 1800 and 2100').max(2100, 'Between 1800 and 2100'),
    designer: z.string().trim().max(120, 'Too long'),
    grass: z.string().trim().max(80, 'Too long'),
};

export const golfCourseInputSchema = z
    .object({
        name: requiredText('Name', 120),
        country: requiredText('Country', 80),
        city: requiredText('City', 80),
        slug: z.string().trim().max(120).optional().default(''),
        address: profileField.address.nullish().transform(v => v || null),
        description: profileField.description.optional().default(''),
        holes: z.number().int().refine(v => (GOLF_HOLES as readonly number[]).includes(v), 'Holes must be 9, 18, 27 or 36'),
        par: profileField.par.nullish().transform(v => v ?? null),
        greenFeeFrom: z.number().min(0, 'Green fee cannot be negative').max(100_000).nullish().transform(v => v ?? null),
        currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter code').optional().default('USD'),
        imageUrls: profileField.imageUrls.optional().default([]),
        amenities: profileField.amenities.optional().default([]).transform(a => [...new Set(a)]),
        timezone: z
            .string()
            .trim()
            .nullish()
            .transform(v => v || null)
            .refine(v => v === null || isValidTimeZone(v), 'Use a time zone name such as Asia/Manila'),
        freeCancelHours: profileField.freeCancelHours.optional().default(48),
        bookingWindowDays: profileField.bookingWindowDays.optional().default(HORIZON_DAYS),
        weatherPolicy: profileField.weatherPolicy.optional().default(''),
        yardage: profileField.yardage.nullish().transform(v => v ?? null),
        yearOpened: profileField.yearOpened.nullish().transform(v => v ?? null),
        designer: profileField.designer.nullish().transform(v => v || null),
        grass: profileField.grass.nullish().transform(v => v || null),
    })
    .transform(v => ({ ...v, slug: v.slug ? slugify(v.slug) : slugify(v.name, v.city) }))
    .refine(v => v.slug.length > 0, {
        path: ['slug'],
        message: 'Enter a slug using a-z, 0-9 and hyphens',
    });

/** What the form sends. */
export type GolfCourseInputRaw = z.input<typeof golfCourseInputSchema>;
/** What the database module accepts. */
export type GolfCourseInput = z.output<typeof golfCourseInputSchema>;

/**
 * What a course may change about itself from the portal (ADR-0050): how it is described, what it
 * promises customers and how far ahead it sells. Name, place, slug, currency, time zone and
 * status are the team's, so they are not here, and `strictObject` turns a request that names one
 * into a refusal rather than a quiet ignore. Every field is required: a missing one must never
 * be read as "clear it".
 */
export const courseProfileInputSchema = z.strictObject({
    description: profileField.description,
    address: profileField.address.nullable().transform(v => v || null),
    amenities: profileField.amenities.transform(a => [...new Set(a)]),
    imageUrls: profileField.imageUrls,
    par: profileField.par.nullable(),
    yardage: profileField.yardage.nullable(),
    yearOpened: profileField.yearOpened.nullable(),
    designer: profileField.designer.nullable().transform(v => v || null),
    grass: profileField.grass.nullable().transform(v => v || null),
    weatherPolicy: profileField.weatherPolicy,
    bookingWindowDays: profileField.bookingWindowDays,
    freeCancelHours: profileField.freeCancelHours,
});

export type CourseProfileInputRaw = z.input<typeof courseProfileInputSchema>;
export type CourseProfileInput = z.output<typeof courseProfileInputSchema>;

/** Each field that changed, as [before, after]. */
export type ProfileDiff = Partial<Record<keyof CourseProfileInput, [unknown, unknown]>>;

/** What a shorter booking window does to tee times already on the sheet. Nothing is deleted. */
export interface WindowImpact {
    /** Open tee times that fall beyond the new window and stop being sold. */
    stopsSelling: number;
    /** Of those, how many already have a live booking; the booking stays. */
    withBookings: number;
}

/** The profile fields of a course, in the shape the portal form edits and the API accepts. */
export function profileOfCourse(c: GolfCourse): CourseProfileInput {
    return {
        description: c.description, address: c.address, amenities: c.amenities, imageUrls: c.imageUrls,
        par: c.par, yardage: c.yardage, yearOpened: c.yearOpened, designer: c.designer, grass: c.grass,
        weatherPolicy: c.weatherPolicy, bookingWindowDays: c.bookingWindowDays, freeCancelHours: c.freeCancelHours,
    };
}

// ── Tee times ────────────────────────────────────────────────────────────────

const timeOfDay = z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour time, e.g. 06:30');

/** A weekly pattern of tee times. Different prices for different times of day are separate schedules. */
export const teeTimeScheduleInputSchema = z
    .object({
        name: requiredText('Name', 80),
        daysOfWeek: z
            .array(z.number().int().min(0).max(6))
            .min(1, 'Pick at least one day')
            .transform(days => [...new Set(days)].sort((a, b) => a - b)),
        firstTee: timeOfDay,
        lastTee: timeOfDay,
        intervalMinutes: z.number().int().min(5, 'Between 5 and 60 minutes').max(60, 'Between 5 and 60 minutes'),
        spots: z.number().int().min(1, 'Between 1 and 4').max(4, 'Between 1 and 4').optional().default(4),
        pricePerPlayer: z.number().min(0, 'Price cannot be negative').max(100_000),
    })
    .refine(v => v.lastTee >= v.firstTee, { path: ['lastTee'], message: 'Last tee must be at or after the first' });

export type TeeTimeScheduleInputRaw = z.input<typeof teeTimeScheduleInputSchema>;
export type TeeTimeScheduleInput = z.output<typeof teeTimeScheduleInputSchema>;

export interface TeeTimeSchedule {
    id: string;
    courseId: string;
    name: string;
    daysOfWeek: number[];
    /** "HH:MM", course-local. */
    firstTee: string;
    lastTee: string;
    intervalMinutes: number;
    spots: number;
    pricePerPlayer: number;
}

export interface TeeTime {
    id: string;
    /** ISO instant. */
    startsAt: string;
    /** "07:38" on the course's clock. */
    localTime: string;
    spots: number;
    spotsLeft: number;
    /** Green fee per player, before the service fee. */
    pricePerPlayer: number;
    /** All-in per player for the party asked about (CONTEXT.md, "All-in price"); absent when not asked. */
    allInPerPlayer?: number;
    /** The currency `allInPerPlayer` is in: the viewer's Charge Currency, not necessarily the course's. */
    allInCurrency?: string;
    /** The course's own currency, which `pricePerPlayer` is in. */
    currency: string;
}

// ── Bookings ─────────────────────────────────────────────────────────────────

const extraChoiceSchema = z.object({
    code: z.enum(GOLF_EXTRAS),
    quantity: z.number().int().min(1).max(4),
});

export const holdRequestSchema = z.object({
    teeTimeId: z.string().uuid(),
    players: z.number().int().min(1).max(4),
    leadName: requiredText('Lead player name', 120),
    extras: z
        .array(extraChoiceSchema)
        .max(GOLF_EXTRAS.length)
        .optional()
        .default([])
        .refine(list => new Set(list.map(e => e.code)).size === list.length, 'Each extra can be chosen once'),
    /** The currency the customer chose to pay in; whether we charge in it is the hold's call. */
    chargeCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter code').optional(),
    /** The total they were shown, in that currency; the hold refuses a price that has since moved. */
    displayedTotal: z.number().positive().max(1_000_000_000).nullish(),
});

/** The extras a course offers, at its price per item (admin). */
export const golfExtrasInputSchema = z
    .array(z.object({
        code: z.enum(GOLF_EXTRAS),
        price: z.number().min(0, 'Price cannot be negative').max(100_000),
    }))
    .max(GOLF_EXTRAS.length)
    .refine(list => new Set(list.map(e => e.code)).size === list.length, 'Each extra can be offered once');

export type GolfBookingStatus = 'held' | 'requested' | 'confirmed' | 'expired' | 'declined' | 'cancelled';

export type GolfCloseReason =
    | 'hold_expired' | 'declined_by_team' | 'not_confirmed_in_time'
    | 'cancelled_by_customer' | 'cancelled_by_team';

/** Instants are ISO strings so a booking crosses the server/client boundary as it is. */
export interface GolfBooking {
    id: string;
    reference: string;
    userId: string;
    courseId: string;
    courseName: string;
    courseSlug: string;
    timezone: string | null;
    teeTimeId: string;
    startsAt: string;
    players: number;
    leadName: string;
    contactEmail: string;
    // Everything from here down to `currency` is in the CHARGE currency: what the customer saw
    // and what their card was authorised for (ADR-0051). The course's own figures follow it.
    pricePerPlayer: number;
    greenFeeTotal: number;
    /** Sum of the extras' lines; the service fee is charged on green fee + extras. */
    extrasTotal: number;
    extras: ExtraLine[];
    serviceFee: number;
    total: number;
    /** The currency the customer was charged in. */
    currency: string;
    /** The course's own currency, and its green fee in it: what the course sees. */
    courseCurrency: string;
    courseGreenFeeTotal: number;
    /** Charge currency per 1 unit of course currency, fixed when the hold was taken. */
    chargeRate: number;
    paymentIntentId: string | null;
    status: GolfBookingStatus;
    holdExpiresAt: string;
    requestedAt: string | null;
    decideBy: string | null;
    confirmedAt: string | null;
    closedAt: string | null;
    closeReason: GolfCloseReason | null;
    refundAmount: number;
    freeCancelUntil: string;
    /** The course's weather rule as it was when the hold started. */
    weatherPolicy: string;
}
