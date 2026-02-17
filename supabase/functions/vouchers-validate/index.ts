/**
 * Supabase Edge Function: vouchers-validate
 *
 * Now backed by LiteAPI Vouchers API.
 * Fetches vouchers from LiteAPI (da.liteapi.travel) instead of local Supabase table.
 * ALL discount calculations still happen here (server-side only).
 *
 * Supports two modes:
 *   POST /vouchers-validate  { action: "validate", code, bookingPrice, ... }
 *   POST /vouchers-validate  { action: "list", bookingPrice, ... }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

declare const Deno: any;

const LITEAPI_VOUCHERS_BASE = 'https://da.liteapi.travel';

// ============================================================================
// Fetch all vouchers from LiteAPI
// ============================================================================

interface LiteAPIVoucher {
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

async function fetchLiteAPIVouchers(apiKey: string): Promise<LiteAPIVoucher[]> {
  const response = await fetch(`${LITEAPI_VOUCHERS_BASE}/vouchers`, {
    method: 'GET',
    headers: {
      'X-API-Key': apiKey,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    console.error(`[vouchers-validate] LiteAPI fetch failed: ${response.status}`);
    return [];
  }

  const data = await response.json();
  // Handle both array and nested response formats
  return Array.isArray(data) ? data : (data.data || []);
}

// ============================================================================
// Discount Calculation (server-side only)
// ============================================================================

function calculateDiscount(
  bookingPrice: number,
  discountValue: number,
  maxDiscountAmount: number
): number {
  let discount = Math.round((bookingPrice * discountValue) / 100);

  if (maxDiscountAmount > 0 && discount > maxDiscountAmount) {
    discount = maxDiscountAmount;
  }

  if (discount > bookingPrice) {
    discount = bookingPrice;
  }

  return Math.round(discount);
}

// ============================================================================
// Handler
// ============================================================================

Deno.serve(async (req: any) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const LITEAPI_KEY = Deno.env.get('LITEAPI_KEY');
    if (!LITEAPI_KEY) {
      throw new Error('Missing LITEAPI_KEY configuration');
    }

    const body = await req.json();
    const { action } = body;

    // Fetch vouchers from LiteAPI
    const vouchers = await fetchLiteAPIVouchers(LITEAPI_KEY);

    if (action === 'validate') {
      return handleValidate(vouchers, body);
    } else if (action === 'list') {
      return handleList(vouchers, body);
    } else {
      throw new Error('Invalid action. Use "validate" or "list".');
    }
  } catch (error: any) {
    console.error('[vouchers-validate] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});

// ============================================================================
// Validate a specific voucher code
// ============================================================================

function handleValidate(vouchers: LiteAPIVoucher[], body: any) {
  const { code, bookingPrice } = body;

  if (!code || !bookingPrice) {
    throw new Error('Missing required fields: code, bookingPrice');
  }

  const normalizedCode = code.trim().toUpperCase();
  console.log(`[vouchers-validate] Validating code: ${normalizedCode} for price: ${bookingPrice}`);

  // Find matching voucher
  const voucher = vouchers.find(
    (v) => v.voucher_code.toUpperCase() === normalizedCode && v.status === 'active'
  );

  if (!voucher) {
    return jsonResponse({ success: true, valid: false, message: 'Invalid or expired voucher code' });
  }

  // Check validity period
  const now = new Date();
  if (voucher.validity_start && new Date(voucher.validity_start) > now) {
    return jsonResponse({ success: true, valid: false, message: 'This voucher is not yet valid' });
  }
  if (voucher.validity_end && new Date(voucher.validity_end) < now) {
    return jsonResponse({ success: true, valid: false, message: 'This voucher has expired' });
  }

  // Check minimum spend
  if (voucher.minimum_spend > 0 && bookingPrice < voucher.minimum_spend) {
    return jsonResponse({
      success: true,
      valid: false,
      message: `Minimum booking amount of $${voucher.minimum_spend} required`,
    });
  }

  // Calculate discount
  const discountAmount = calculateDiscount(bookingPrice, voucher.discount_value, voucher.maximum_discount_amount);
  const finalPrice = Math.max(0, Math.round(bookingPrice - discountAmount));

  console.log(`[vouchers-validate] Valid! Discount: ${discountAmount}, Final: ${finalPrice}`);

  return jsonResponse({
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
  });
}

// ============================================================================
// List available vouchers for a booking
// ============================================================================

function handleList(vouchers: LiteAPIVoucher[], body: any) {
  const { bookingPrice } = body;

  if (!bookingPrice) {
    throw new Error('Missing required field: bookingPrice');
  }

  console.log(`[vouchers-validate] Listing available vouchers for price: ${bookingPrice}`);

  const now = new Date();

  const eligible = vouchers.filter((v) => {
    if (v.status !== 'active') return false;
    if (v.validity_start && new Date(v.validity_start) > now) return false;
    if (v.validity_end && new Date(v.validity_end) < now) return false;
    if (v.minimum_spend > 0 && bookingPrice < v.minimum_spend) return false;
    return true;
  });

  const promos = eligible.map((v) => ({
    code: v.voucher_code,
    description: v.terms_and_conditions || `${v.discount_value}% off`,
    discountType: 'percentage',
    discountValue: v.discount_value,
    minBookingAmount: v.minimum_spend || null,
    maxDiscountAmount: v.maximum_discount_amount || null,
    category: 'general',
    validUntil: v.validity_end,
  }));

  return jsonResponse({ success: true, data: promos });
}

// ============================================================================
// Helpers
// ============================================================================

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}
