import { z } from 'zod';
import { MINIMUM_ACCOUNT_AGE, isAtLeastAge, isPlausibleBirthDate } from '@/lib/age';

export const emailSchema = z.object({
    email: z.string().min(1, 'Email is required').email('Please enter a valid email address'),
});

export const passwordSchema = z.object({
    password: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number'),
});

export const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1, 'Password is required'),
});

/**
 * How long a person's own name may be, here and in the database (QA BG-9).
 *
 * Nothing capped it: a profile was saved with a 13,708-character first name, which then
 * rendered as a wall of text wherever the account is shown. 30 characters per field is the
 * length QA asked for, and it holds the long real names we already store.
 */
export const NAME_MAX_LENGTH = 30;

const personNameSchema = (label: string) =>
    z.string()
        .trim()
        .min(1, `${label} is required`)
        .max(NAME_MAX_LENGTH, `${label} must be ${NAME_MAX_LENGTH} characters or fewer`);

export const registerSchema = z.object({
    firstName: personNameSchema('First name'),
    lastName: personNameSchema('Last name'),
    email: z.string().email('Invalid email address'),
    password: passwordSchema.shape.password,
    // Mirrors the server-side gate in /api/auth/signup so the form can report it
    // inline. The API remains the authority — this only saves a round trip.
    birthDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth is required')
        .refine(isPlausibleBirthDate, 'Please enter a valid date of birth')
        .refine(
            v => isAtLeastAge(v),
            `You must be at least ${MINIMUM_ACCOUNT_AGE} years old to create an account`,
        ),
});

export const profileSchema = z.object({
    firstName: personNameSchema('First name'),
    lastName: personNameSchema('Last name'),
});

export const updatePasswordSchema = z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema.shape.password,
});

export type EmailInput = z.infer<typeof emailSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
