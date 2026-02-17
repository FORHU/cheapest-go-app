/**
 * Voucher/Promo system types.
 * Aligned with LiteAPI Vouchers API.
 * All discount calculations happen server-side only.
 */

// ============================================================================
// Voucher Types
// ============================================================================

/** LiteAPI only supports 'percentage' — kept 'fixed' for local fallback/display */
export type VoucherDiscountType = 'percentage' | 'fixed';

export type VoucherCategory =
  | 'general'
  | 'first_time'
  | 'location_based'
  | 'hotel_specific'
  | 'seasonal';

/** LiteAPI voucher as returned by GET /vouchers */
export interface LiteAPIVoucher {
  id: string;
  voucher_code: string;
  discount_type: 'percentage';
  discount_value: number;
  minimum_spend: number;
  maximum_discount_amount: number;
  validity_start: string;
  validity_end: string;
  usages_limit: number;
  status: 'active' | 'inactive';
  terms_and_conditions?: string;
}

/** Normalized voucher for internal use */
export interface Voucher {
  id: string;
  code: string;
  description: string;
  discountType: VoucherDiscountType;
  discountValue: number;
  minBookingAmount: number | null;
  maxDiscountAmount: number | null;
  category: VoucherCategory;
  validFrom: string;
  validUntil: string;
  usageLimit: number | null;
  timesUsed: number;
  active: boolean;
  /** Optional hotel IDs this voucher applies to */
  hotelIds: string[] | null;
  /** Optional location codes this voucher applies to */
  locationCodes: string[] | null;
}

// ============================================================================
// Validation Result (from edge function)
// ============================================================================

export interface VoucherValidationSuccess {
  success: true;
  valid: true;
  discountAmount: number;
  finalPrice: number;
  promo: {
    code: string;
    type: VoucherDiscountType;
    value: number;
    description: string;
  };
}

export interface VoucherValidationInvalid {
  success: true;
  valid: false;
  message: string;
}

export type VoucherValidationResult =
  | VoucherValidationSuccess
  | VoucherValidationInvalid;

// ============================================================================
// Available Promo (displayed to user)
// ============================================================================

export interface AvailablePromo {
  code: string;
  description: string;
  discountType: VoucherDiscountType;
  discountValue: number;
  minBookingAmount: number | null;
  maxDiscountAmount: number | null;
  category: VoucherCategory;
  validUntil: string;
}

// ============================================================================
// Applied Voucher State (client display only — values from server)
// ============================================================================

export interface AppliedVoucher {
  code: string;
  discountType: VoucherDiscountType;
  discountValue: number;
  discountAmount: number;
  finalPrice: number;
  description: string;
}

// ============================================================================
// Server Action Params
// ============================================================================

export interface ValidateVoucherParams {
  code: string;
  bookingPrice: number;
  currency: string;
  hotelId?: string;
  locationCode?: string;
}

export interface GetAvailableVouchersParams {
  bookingPrice: number;
  currency: string;
  hotelId?: string;
  locationCode?: string;
}
