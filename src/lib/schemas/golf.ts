import { z } from 'zod';

/**
 * Golf Course listings (CONTEXT.md, "Golf Course"). Client-safe: types, the input schema the
 * admin form and the API share, and the slug rule. Queries live in lib/server/golf/courses.
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
