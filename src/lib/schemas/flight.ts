import { z } from 'zod';

// ─── Primitives ───────────────────────────────────────────────────────────────

const iataSchema = z
    .string()
    .regex(/^[A-Z]{3}$/, 'Must be a 3-letter IATA code (e.g. MNL)');

const dateSchema = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');

// ─── Passenger ────────────────────────────────────────────────────────────────

export const flightPassengerSchema = z.object({
    type: z.enum(['ADT', 'CHD', 'INF']),
    firstName: z.string().min(1, 'First name is required').max(100),
    lastName: z.string().min(1, 'Last name is required').max(100),
    gender: z.enum(['M', 'F'], { message: 'Gender is required' }),
    birthDate: dateSchema.refine(
        v => new Date(v) < new Date(),
        'Date of birth must be in the past',
    ),
    nationality: z
        .string()
        .length(2, 'Must be a 2-letter country code (e.g. PH)'),
    passport: z
        .string()
        .min(6, 'Passport number must be at least 6 characters')
        .max(20, 'Passport number must be at most 20 characters')
        .regex(/^[A-Z0-9]+$/i, 'Passport number must be alphanumeric'),
    passportExpiry: dateSchema.refine(
        v => new Date(v) > new Date(),
        'Passport has expired',
    ),
});

// ─── Contact ──────────────────────────────────────────────────────────────────

export const flightContactSchema = z.object({
    email: z.string().min(1, 'Email is required').email('Valid email is required').max(254),
    phone: z.string().min(5, 'Phone number is required').max(20),
    countryCode: z.string().min(1, 'Country code is required').max(5),
    addressLine: z.string().min(1).max(200).optional(),
    city: z.string().min(1).max(100).optional(),
    postalCode: z.string().min(1).max(20).optional(),
    country: z.string().length(2).optional(),
});

// ─── Booking form (used by /api/flights/book) ─────────────────────────────────

export const flightBookingSchema = z.object({
    passengers: z.array(flightPassengerSchema).min(1, 'At least one passenger is required'),
    contact: flightContactSchema,
});

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
