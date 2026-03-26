import type {
  VoucherValidationResult,
  AvailablePromo,
} from '@/types/voucher';

// Vouchers are currently disabled — LiteAPI removed, ONDA voucher API pending.

export async function validateVoucherServer(_params: {
  code: string;
  bookingPrice: number;
  currency: string;
  hotelId?: string;
  locationCode?: string;
  userId?: string;
}): Promise<VoucherValidationResult> {
  return { success: true, valid: false, message: 'Promo codes are temporarily unavailable.' };
}

export async function getAvailableVouchersServer(_params: {
  bookingPrice: number;
  currency: string;
  hotelId?: string;
  locationCode?: string;
}): Promise<AvailablePromo[]> {
  return [];
}

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
    const { error } = await params.supabase
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
    if (error) return { success: false, error: 'Failed to record usage locally' };
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to record voucher usage' };
  }
}
