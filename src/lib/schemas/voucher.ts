import { z } from 'zod';

/**
 * Zod schemas for voucher validation.
 * Used in server actions to validate all inputs before processing.
 */

export const validateVoucherSchema = z.object({
  code: z
    .string()
    .min(1, 'Promo code is required')
    .max(50, 'Promo code is too long')
    .transform((v) => v.trim().toUpperCase()),
  bookingPrice: z
    .number()
    .positive('Booking price must be positive'),
  currency: z
    .string()
    .min(2)
    .max(5)
    .default('PHP'),
  hotelId: z.string().optional(),
  locationCode: z.string().optional(),
});

export type ValidateVoucherInput = z.infer<typeof validateVoucherSchema>;

export const getAvailableVouchersSchema = z.object({
  bookingPrice: z
    .number()
    .positive('Booking price must be positive'),
  currency: z
    .string()
    .min(2)
    .max(5)
    .default('PHP'),
  hotelId: z.string().optional(),
  locationCode: z.string().optional(),
});

export type GetAvailableVouchersInput = z.infer<typeof getAvailableVouchersSchema>;
