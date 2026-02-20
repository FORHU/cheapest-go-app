import { z } from 'zod';

export const userDetailsSchema = z.object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    email: z.string().min(1, 'Email is required').email('Please enter a valid email'),
    phone: z.string().optional(),
});

export const guestDetailsSchema = z.object({
    guestFirstName: z.string().min(1, 'Guest first name is required'),
    guestLastName: z.string().min(1, 'Guest last name is required'),
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
