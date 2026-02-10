'use server';

/**
 * Server Actions for voucher/promo operations.
 * Client never validates or calculates — all logic goes through
 * edge function via server utilities.
 *
 * Flow: Client → Server Action → Server Utility → Edge Function → Supabase DB
 */

import { validateVoucherSchema, getAvailableVouchersSchema } from '@/lib/schemas';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { validateVoucherServer, getAvailableVouchersServer, recordVoucherUsage } from '@/lib/server/vouchers';
import type { ActionResult } from './types';
import type { VoucherValidationResult, AvailablePromo } from '@/types/voucher';

// ============================================================================
// Validate a voucher code
// ============================================================================

export async function validateVoucher(params: {
  code: string;
  bookingPrice: number;
  currency?: string;
  hotelId?: string;
  locationCode?: string;
}): Promise<ActionResult<VoucherValidationResult>> {
  // Validate input with Zod
  const validation = validateVoucherSchema.safeParse(params);
  if (!validation.success) {
    const firstError = validation.error.issues[0];
    return { success: false, error: firstError?.message || 'Invalid input' };
  }

  try {
    const { user, error: authError } = await getAuthenticatedUser();
    if (authError || !user) {
      return { success: false, error: 'Authentication required' };
    }

    const result = await validateVoucherServer({
      code: validation.data.code,
      bookingPrice: validation.data.bookingPrice,
      currency: validation.data.currency,
      hotelId: validation.data.hotelId,
      locationCode: validation.data.locationCode,
      userId: user.id,
    });

    return { success: true, data: result };
  } catch (error) {
    console.error('[validateVoucher] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Voucher validation failed',
    };
  }
}

// ============================================================================
// Get available vouchers for current booking
// ============================================================================

export async function getAvailableVouchers(params: {
  bookingPrice: number;
  currency?: string;
  hotelId?: string;
  locationCode?: string;
}): Promise<ActionResult<AvailablePromo[]>> {
  // Validate input
  const validation = getAvailableVouchersSchema.safeParse(params);
  if (!validation.success) {
    const firstError = validation.error.issues[0];
    return { success: false, error: firstError?.message || 'Invalid input' };
  }

  try {
    const { user, error: authError } = await getAuthenticatedUser();
    if (authError || !user) {
      return { success: false, error: 'Authentication required' };
    }

    const promos = await getAvailableVouchersServer({
      bookingPrice: validation.data.bookingPrice,
      currency: validation.data.currency,
      hotelId: validation.data.hotelId,
      locationCode: validation.data.locationCode,
    });

    return { success: true, data: promos };
  } catch (error) {
    console.error('[getAvailableVouchers] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch vouchers',
    };
  }
}

// ============================================================================
// Record voucher usage after successful booking
// ============================================================================

export async function saveVoucherUsage(params: {
  voucherCode: string;
  bookingId: string;
  originalPrice: number;
  discountApplied: number;
  finalPrice: number;
  currency: string;
}): Promise<ActionResult<{ recorded: boolean }>> {
  try {
    const { user, supabase, error: authError } = await getAuthenticatedUser();
    if (authError || !user) {
      return { success: false, error: 'Authentication required' };
    }

    const result = await recordVoucherUsage({
      supabase,
      voucherCode: params.voucherCode,
      userId: user.id,
      bookingId: params.bookingId,
      originalPrice: params.originalPrice,
      discountApplied: params.discountApplied,
      finalPrice: params.finalPrice,
      currency: params.currency,
    });

    if (!result.success) {
      return { success: false, error: result.error || 'Failed to record usage' };
    }

    return { success: true, data: { recorded: true } };
  } catch (error) {
    console.error('[saveVoucherUsage] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save voucher usage',
    };
  }
}
