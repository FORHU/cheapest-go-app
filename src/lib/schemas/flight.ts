import { z } from 'zod';
import { isPlausibleBirthDate } from '@/lib/age';
import { validatePhone } from '@/lib/phone';
import { validatePassport } from '@/lib/passport';

// ─── Primitives ───────────────────────────────────────────────────────────────

const iataSchema = z
    .string()
    .regex(/^[A-Z]{3}$/, 'Must be a 3-letter IATA code (e.g. MNL)');

const dateSchema = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');

// ─── Passenger ────────────────────────────────────────────────────────────────

const nameSchema = z
    .string()
    .min(1, 'Required')
    .max(100)
    .regex(
        /^[A-Za-z\s'\-]+$/,
        "Use English letters only (e.g. Jose instead of José)",
    );

export const flightPassengerSchema = z.object({
    type: z.enum(['ADT', 'CHD', 'INF']),
    firstName: nameSchema.refine(v => v.trim().length > 0, 'First name is required'),
    lastName: nameSchema.refine(v => v.trim().length > 0, 'Last name is required'),
    gender: z.enum(['M', 'F'], { message: 'Gender is required' }),
    // Bounded at both ends: "in the past" alone accepted 1850-01-01, which reaches
    // the airline as a valid-looking passenger and is rejected at check-in.
    birthDate: dateSchema
        .refine(v => new Date(v) < new Date(), 'Date of birth must be in the past')
        .refine(isPlausibleBirthDate, 'Please enter a valid date of birth'),
    nationality: z
        .string()
        .length(2, 'Must be a 2-letter country code (e.g. PH)'),
    // Structure only here — the real rule depends on the issuing state, so it is
    // applied against `nationality` in the superRefine below.
    passport: z.string().min(1, 'Passport number is required'),
    passportExpiry: dateSchema.refine(
        v => new Date(v) > new Date(),
        'Passport has expired',
    ),
})
    // Checked on the passenger, not the field: which format is correct depends on
    // the issuing state, and that lives in `nationality` beside it. Changing the
    // nationality therefore re-validates the number, which is the behaviour a
    // traveller expects when they correct their country.
    .superRefine((pax, ctx) => {
        const problem = validatePassport(pax.passport, pax.nationality);
        if (problem) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: problem.message,
                // Anchors the inline error to the passport input — the form finds
                // fields by `data-field="<dotted zod path>"`.
                path: ['passport'],
            });
        }
    });

// ─── Contact ──────────────────────────────────────────────────────────────────

export const flightContactSchema = z.object({
    email: z.string().min(1, 'Email is required').email('Valid email is required').max(254),
    phone: z
        .string()
        .min(5, 'Phone number is required')
        .max(20)
        .regex(/^\d+$/, 'Phone number must contain digits only'),
    countryCode: z.string().min(1, 'Country code is required').max(5),
    addressLine: z.string().min(1).max(200).optional(),
    city: z.string().min(1).max(100).optional(),
    postalCode: z.string().min(1).max(20).optional(),
    country: z.string().length(2).optional(),
})
    // Checked on the pair, not per field: whether a number is valid E.164 depends
    // on the country code and the subscriber number together.
    //
    // This used to be length-only (`min(5).max(20)`), so "abcde" passed and the
    // real check happened ~600 lines into /api/flights/book — after the booking
    // session row was written, and only once the airline had already refused it.
    // The traveller saw "Booking Failed", not a message under the input.
    .superRefine((contact, ctx) => {
        const problem = validatePhone(contact.countryCode, contact.phone);
        if (problem) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: problem.message,
                // Path drives the inline error: the booking form locates inputs by
                // `data-field="<dotted zod path>"`, so this lands under the right one.
                path: [problem.field],
            });
        }
    });

// ─── Booking form (used by /api/flights/book) ─────────────────────────────────

export const flightBookingSchema = z.object({
    passengers: z.array(flightPassengerSchema).min(1, 'At least one passenger is required'),
    contact: flightContactSchema,
})
    // The search form already requires an adult, but the booking API is what actually
    // enforces rules — without these it accepted a party of children with no adult,
    // which airlines only reject at check-in, after the fare is ticketed and paid.
    .refine(
        b => b.passengers.some(p => p.type === 'ADT'),
        { message: 'At least one adult passenger is required', path: ['passengers'] },
    )
    .refine(
        b => b.passengers.filter(p => p.type === 'INF').length
            <= b.passengers.filter(p => p.type === 'ADT').length,
        { message: 'Each infant must be accompanied by an adult', path: ['passengers'] },
    );

// ─── Search ───────────────────────────────────────────────────────────────────

export const flightSearchPassengersSchema = z
    .object({
        adults: z.number().int().min(1, 'At least 1 adult required').max(9),
        children: z.number().int().min(0).max(8).default(0),
        infants: z.number().int().min(0).max(8).default(0),
    })
    .refine(p => p.infants <= p.adults, { message: 'Infants cannot exceed adults' })
    .refine(p => p.adults + p.children + p.infants <= 9, { message: 'Maximum 9 passengers total' });

export const flightSegmentSchema = z
    .object({
        origin: iataSchema,
        destination: iataSchema,
        departureDate: dateSchema,
    })
    .refine(s => s.origin !== s.destination, { message: 'Origin and destination must differ' });

export const flightSearchSchema = z.object({
    // Simple form — converted to segments array server-side
    origin: iataSchema.optional(),
    destination: iataSchema.optional(),
    departureDate: dateSchema.optional(),
    returnDate: dateSchema.optional(),
    // Multi-city form
    segments: z.array(flightSegmentSchema).max(4).optional(),
    passengers: flightSearchPassengersSchema,
    cabinClass: z
        .enum(['economy', 'premium_economy', 'business', 'first'])
        .default('economy'),
    tripType: z.enum(['one-way', 'round-trip', 'multi-city']).optional(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type FlightPassengerForm = z.infer<typeof flightPassengerSchema>;
export type FlightContactForm = z.infer<typeof flightContactSchema>;
export type FlightBookingForm = z.infer<typeof flightBookingSchema>;
export type FlightSearchInput = z.infer<typeof flightSearchSchema>;
export type FlightSearchPassengers = z.infer<typeof flightSearchPassengersSchema>;
