import { z } from 'zod';

export const flightPassengerSchema = z.object({
    type: z.enum(['ADT', 'CHD', 'INF']),
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    gender: z.string().min(1, 'Gender is required'),
    birthDate: z.string().min(1, 'Date of birth is required'),
    nationality: z.string().min(1, 'Nationality is required'),
    passport: z.string().min(1, 'Passport number is required'),
    passportExpiry: z.string().min(1, 'Passport expiry date is required'),
});

export const flightContactSchema = z.object({
    email: z.string().min(1, 'Email is required').email('Valid email is required'),
    phone: z.string().min(1, 'Phone number is required'),
    countryCode: z.string().min(1, 'Country code is required'),
    addressLine: z.string().min(1, 'Billing address is required'),
    city: z.string().min(1, 'City is required'),
    postalCode: z.string().min(1, 'Postal code is required'),
    country: z.string().min(1, 'Country is required'),
});

export const flightBookingSchema = z.object({
    passengers: z.array(flightPassengerSchema).min(1, 'At least one passenger is required'),
    contact: flightContactSchema,
});

export type FlightPassengerForm = z.infer<typeof flightPassengerSchema>;
export type FlightContactForm = z.infer<typeof flightContactSchema>;
export type FlightBookingForm = z.infer<typeof flightBookingSchema>;
