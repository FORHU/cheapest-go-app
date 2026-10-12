import { z } from 'zod';

/**
 * Course staff onboarding (CONTEXT.md, "Course Staff"). Client-safe: the request form, the admin
 * dialogs and the routes share these. Queries live in lib/server/golf.
 */

const text = (label: string, max: number) =>
    z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long`);

export const staffEmailSchema = z
    .string()
    .trim()
    .toLowerCase()
    .max(254, 'That email is too long')
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address');

/** What a person tells us when asking to list or claim a course. */
export const courseRequestInputSchema = z.object({
    contactName: text('Your name', 120),
    courseName: text('Course name', 120),
    country: text('Country', 80),
    city: text('City', 80),
    /** A course that is already listed, when the person is claiming it. */
    existingCourseId: z.string().uuid().nullish().transform(v => v ?? null),
    message: z.string().trim().max(1000, 'At most 1,000 characters').optional().default(''),
});
export type CourseRequestInput = z.output<typeof courseRequestInputSchema>;
export type CourseRequestInputRaw = z.input<typeof courseRequestInputSchema>;

export const invitationInputSchema = z.object({
    courseId: z.string().uuid(),
    email: staffEmailSchema,
});

export type CourseRequestStatus = 'pending' | 'approved' | 'rejected';

export interface CourseRequest {
    id: string;
    userId: string;
    status: CourseRequestStatus;
    contactName: string;
    contactEmail: string;
    courseName: string;
    country: string;
    city: string;
    existingCourseId: string | null;
    existingCourseName: string | null;
    message: string;
    courseId: string | null;
    decisionNote: string;
    createdAt: string;
    decidedAt: string | null;
}

export type InvitationState = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface CourseInvitation {
    id: string;
    courseId: string;
    email: string;
    state: InvitationState;
    expiresAt: string;
    createdAt: string;
}
