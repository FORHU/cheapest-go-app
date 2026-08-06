import { z } from 'zod';

const nameSchema = z
    .string()
    .min(1, 'Required')
    .max(100)
    .regex(
        /^[\p{L}\s'\-]+$/u,
        "Name must only contain letters",
    );

export const userDetailsSchema = z.object({
    firstName: nameSchema.refine(v => v.trim().length > 0, 'First name is required'),
    lastName: nameSchema.refine(v => v.trim().length > 0, 'Last name is required'),
    email: z.string().min(1, 'Email is required').email('Please enter a valid email').max(254, 'Email is too long'),
    phone: z
        .string()
        .min(5, 'Phone number is required')
        .max(20, 'Phone number is too long')
        .regex(/^\d+$/, 'Phone number must contain digits only'),
});

export const guestDetailsSchema = z.object({
    guestFirstName: z.string().min(1, 'Guest first name is required').max(100, 'First name is too long'),
    guestLastName: z.string().min(1, 'Guest last name is required').max(100, 'Last name is too long'),
});

export const paymentSchema = z.object({
    cardNumber: z
        .string()
        .min(1, 'Card number is required')
        .regex(/^[\d\s]{13,19}$/, 'Enter a valid card number'),
    expiry: z
        .string()
        .min(1, 'Expiry date is required')
        .regex(/^(0[1-9]|1[0-2])\s*\/\s*\d{2}$/, 'Use MM/YY format'),
    cvc: z
        .string()
        .min(1, 'Security code is required')
        .regex(/^\d{3,4}$/, 'Enter a valid CVC'),
});

/**
 * Full checkout validation — combines user details + payment.
 * Guest details are validated separately only when bookingFor === 'someone_else'.
 */
export const checkoutSchema = userDetailsSchema.merge(paymentSchema);

export type UserDetailsInput = z.infer<typeof userDetailsSchema>;
export type GuestDetailsInput = z.infer<typeof guestDetailsSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
