import { listVouchersLiteApi } from './liteapi';
import type {
  VoucherValidationResult,
  AvailablePromo,
  LiteAPIVoucher,
} from '@/types/voucher';

// ============================================================================
// Normalize LiteAPI voucher to our AvailablePromo format
// ============================================================================

function liteApiToPromo(v: LiteAPIVoucher): AvailablePromo {
  return {
    code: v.voucher_code,
    description: v.terms_and_conditions || `${v.discount_value}% off`,
    discountType: 'percentage',
    discountValue: v.discount_value,
    minBookingAmount: v.minimum_spend || null,
    maxDiscountAmount: v.maximum_discount_amount || null,
    category: 'general',
    validUntil: v.validity_end,
  };
}

// ============================================================================
// Calculate discount preview (for UI display before prebook)
// ============================================================================

function calculateDiscount(
  discountValue: number,
  maximumDiscountAmount: number,
  bookingPrice: number
): { discountAmount: number; finalPrice: number } {
  let discountAmount = (bookingPrice * discountValue) / 100;
  if (maximumDiscountAmount > 0 && discountAmount > maximumDiscountAmount) {
    discountAmount = maximumDiscountAmount;
  }
  const finalPrice = Math.max(0, bookingPrice - discountAmount);
  return {
    discountAmount: Math.round(discountAmount * 100) / 100,
    finalPrice: Math.round(finalPrice * 100) / 100,
  };
}

// ============================================================================
// Validate a voucher code by checking LiteAPI vouchers list
// ============================================================================

export async function validateVoucherServer(params: {
  code: string;
  bookingPrice: number;
  currency: string;
  hotelId?: string;
  locationCode?: string;
  userId?: string;
}): Promise<VoucherValidationResult> {
  // Fetch all vouchers from LiteAPI
  const result = await listVouchersLiteApi();

  if (!result.success || !result.data) {
    return { success: true, valid: false, message: 'Unable to validate voucher at this time' };
  }

  // LiteAPI returns an array of vouchers (may be nested in data.data)
  const vouchers: LiteAPIVoucher[] = Array.isArray(result.data)
    ? result.data
    : (result.data.data || []);

  // Find matching voucher by code (case-insensitive)
  const voucher = vouchers.find(
    (v: LiteAPIVoucher) => v.voucher_code.toUpperCase() === params.code.toUpperCase()
  );

  if (!voucher) {
    return { success: true, valid: false, message: 'Invalid promo code' };
  }

  // Check status
  if (voucher.status !== 'active') {
    return { success: true, valid: false, message: 'This promo code is no longer active' };
  }

  // Check validity dates
  const now = new Date();
  if (voucher.validity_start && new Date(voucher.validity_start) > now) {
    return { success: true, valid: false, message: 'This promo code is not yet valid' };
  }
  if (voucher.validity_end && new Date(voucher.validity_end) < now) {
    return { success: true, valid: false, message: 'This promo code has expired' };
  }

  // Check minimum spend
  if (voucher.minimum_spend > 0 && params.bookingPrice < voucher.minimum_spend) {
    return {
      success: true,
      valid: false,
      message: `Minimum booking amount of $${voucher.minimum_spend.toLocaleString()} required`,
    };
  }

  // Calculate discount preview
  const { discountAmount, finalPrice } = calculateDiscount(
    voucher.discount_value,
    voucher.maximum_discount_amount,
    params.bookingPrice
  );

  return {
    success: true,
    valid: true,
    discountAmount,
    finalPrice,
    promo: {
      code: voucher.voucher_code,
      type: 'percentage',
      value: voucher.discount_value,
      description: voucher.terms_and_conditions || `${voucher.discount_value}% off`,
    },
  };
}

// ============================================================================
// Get available vouchers from LiteAPI
// ============================================================================

export async function getAvailableVouchersServer(params: {
  bookingPrice: number;
  currency: string;
  hotelId?: string;
  locationCode?: string;
}): Promise<AvailablePromo[]> {
  const result = await listVouchersLiteApi();

  if (!result.success || !result.data) {
    return [];
  }

  const vouchers: LiteAPIVoucher[] = Array.isArray(result.data)
    ? result.data
    : (result.data.data || []);
  const now = new Date();

  // Filter to active, valid vouchers that meet minimum spend
  return vouchers
    .filter((v: LiteAPIVoucher) => {
      if (v.status !== 'active') return false;
      if (v.validity_start && new Date(v.validity_start) > now) return false;
      if (v.validity_end && new Date(v.validity_end) < now) return false;
      if (v.minimum_spend > 0 && params.bookingPrice < v.minimum_spend) return false;
      return true;
    })
    .map(liteApiToPromo);
}

// ============================================================================
// Record voucher usage after booking is confirmed (local audit trail)
// LiteAPI tracks usage via its own history endpoint automatically
// ============================================================================

export async function recordVoucherUsage(params: {
  supabase: any;
  voucherCode: string;
  userId: string;
  bookingId: string;
  originalPrice: number;
  discountApplied: number;
  finalPrice: number;
  currency: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    // Record in local voucher_usage table for audit
    const { error: usageError } = await params.supabase
      .from('voucher_usage')
      .insert({
        voucher_code: params.voucherCode,
        user_id: params.userId,
        booking_id: params.bookingId,
        original_price: params.originalPrice,
        discount_applied: params.discountApplied,
        final_price: params.finalPrice,
        currency: params.currency,
      });

    if (usageError) {
      console.error('[recordVoucherUsage] Insert error:', usageError);
      // Non-critical — LiteAPI tracks usage via its own history endpoint
      return { success: false, error: 'Failed to record usage locally' };
    }

    return { success: true };
  } catch (error) {
    console.error('[recordVoucherUsage] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record voucher usage',
    };
  }
}
