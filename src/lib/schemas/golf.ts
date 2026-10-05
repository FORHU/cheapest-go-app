import { z } from 'zod';
import { isValidTimeZone } from '@/lib/golf/time';

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

export const golfCourseInputSchema = z
    .object({
        name: requiredText('Name', 120),
        country: requiredText('Country', 80),
        city: requiredText('City', 80),
        slug: z.string().trim().max(120).optional().default(''),
        address: z.string().trim().max(300).nullish().transform(v => v || null),
        description: z.string().trim().max(10_000).optional().default(''),
        holes: z.number().int().refine(v => (GOLF_HOLES as readonly number[]).includes(v), 'Holes must be 9, 18, 27 or 36'),
        par: z.number().int().min(27, 'Par must be between 27 and 144').max(144, 'Par must be between 27 and 144').nullish().transform(v => v ?? null),
        greenFeeFrom: z.number().min(0, 'Green fee cannot be negative').max(100_000).nullish().transform(v => v ?? null),
        currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter code').optional().default('USD'),
        imageUrls: z
            .array(z.string().trim().url('Not a valid URL').refine(u => u.startsWith('https://'), 'Image URLs must start with https://'))
            .max(20, 'At most 20 images')
            .optional()
            .default([]),
        amenities: z.array(z.enum(GOLF_AMENITIES)).optional().default([]).transform(a => [...new Set(a)]),
        timezone: z
            .string()
            .trim()
            .nullish()
            .transform(v => v || null)
            .refine(v => v === null || isValidTimeZone(v), 'Use a time zone name such as Asia/Manila'),
        freeCancelHours: z.number().int().min(0, 'Between 0 and 720 hours').max(720, 'Between 0 and 720 hours').optional().default(48),
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
    pricePerPlayer: number;
    currency: string;
}

// ── Bookings ─────────────────────────────────────────────────────────────────

export const holdRequestSchema = z.object({
    teeTimeId: z.string().uuid(),
    players: z.number().int().min(1).max(4),
    leadName: requiredText('Lead player name', 120),
});

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
    pricePerPlayer: number;
    greenFeeTotal: number;
    serviceFee: number;
    total: number;
    currency: string;
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
}
