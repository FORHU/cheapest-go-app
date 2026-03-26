/**
 * Supabase Edge Function: vouchers-validate
 *
 * Backed by the local Supabase `vouchers` table.
 * ALL discount calculations happen here (server-side only).
 *
 * Supports two modes:
 *   POST /vouchers-validate  { action: "validate", code, bookingPrice, ... }
 *   POST /vouchers-validate  { action: "list", bookingPrice, ... }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

declare const Deno: any;

// ============================================================================
// Types
// ============================================================================

interface VoucherRow {
  id: string;
  code: string;
  description: string;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  min_booking_amount: number | null;
  max_discount_amount: number | null;
  category: string;
  hotel_ids: string[] | null;
  location_codes: string[] | null;
  valid_from: string;
  valid_until: string;
  usage_limit: number | null;
  times_used: number;
  active: boolean;
}

// ============================================================================
// Fetch vouchers from local Supabase table
// ============================================================================

async function fetchVouchers(supabaseUrl: string, serviceKey: string): Promise<VoucherRow[]> {
  const supabase = createClient(supabaseUrl, serviceKey);
  const { data, error } = await supabase
    .from('vouchers')
    .select('*')
    .eq('active', true)
    .lte('valid_from', new Date().toISOString())
    .gte('valid_until', new Date().toISOString());

  if (error) {
    console.error('[vouchers-validate] DB fetch failed:', error.message);
    return [];
  }
  return (data || []) as VoucherRow[];
}

// ============================================================================
// Discount Calculation (server-side only)
// ============================================================================

function calculateDiscount(
  bookingPrice: number,
  voucher: VoucherRow
): number {
  let discount: number;

  if (voucher.discount_type === 'percent') {
    discount = Math.round((bookingPrice * voucher.discount_value) / 100);
    if (voucher.max_discount_amount && discount > voucher.max_discount_amount) {
      discount = voucher.max_discount_amount;
    }
  } else {
    // fixed
    discount = voucher.discount_value;
  }

  return Math.min(Math.round(discount), bookingPrice);
}

// ============================================================================
// Handler
// ============================================================================

Deno.serve(async (req: any) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceKey) {
      throw new Error('Missing Supabase configuration');
    }

    const body = await req.json();
    const { action } = body;

    const vouchers = await fetchVouchers(supabaseUrl, serviceKey);

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

function handleValidate(vouchers: VoucherRow[], body: any) {
  const { code, bookingPrice } = body;

  if (!code || !bookingPrice) {
    throw new Error('Missing required fields: code, bookingPrice');
  }

  const normalizedCode = code.trim().toUpperCase();
  console.log(`[vouchers-validate] Validating code: ${normalizedCode} for price: ${bookingPrice}`);

  const voucher = vouchers.find(
    (v) => v.code.toUpperCase() === normalizedCode
  );

  if (!voucher) {
    return jsonResponse({ success: true, valid: false, message: 'Invalid or expired voucher code' });
  }

  // Check usage limit
  if (voucher.usage_limit !== null && voucher.times_used >= voucher.usage_limit) {
    return jsonResponse({ success: true, valid: false, message: 'This voucher has reached its usage limit' });
  }

  // Check minimum spend
  if (voucher.min_booking_amount && bookingPrice < voucher.min_booking_amount) {
    return jsonResponse({
      success: true,
      valid: false,
      message: `Minimum booking amount of ${voucher.min_booking_amount} required`,
    });
  }

  const discountAmount = calculateDiscount(bookingPrice, voucher);
  const finalPrice = Math.max(0, Math.round(bookingPrice - discountAmount));

  console.log(`[vouchers-validate] Valid! Discount: ${discountAmount}, Final: ${finalPrice}`);

  return jsonResponse({
    success: true,
    valid: true,
    discountAmount,
    finalPrice,
    promo: {
      code: voucher.code,
      type: voucher.discount_type === 'percent' ? 'percentage' : 'fixed',
      value: voucher.discount_value,
      description: voucher.description || `${voucher.discount_value}${voucher.discount_type === 'percent' ? '%' : ''} off`,
    },
  });
}

// ============================================================================
// List available vouchers for a booking
// ============================================================================

function handleList(vouchers: VoucherRow[], body: any) {
  const { bookingPrice } = body;

  if (!bookingPrice) {
    throw new Error('Missing required field: bookingPrice');
  }

  console.log(`[vouchers-validate] Listing available vouchers for price: ${bookingPrice}`);

  const eligible = vouchers.filter((v) => {
    if (v.usage_limit !== null && v.times_used >= v.usage_limit) return false;
    if (v.min_booking_amount && bookingPrice < v.min_booking_amount) return false;
    return true;
  });

  const promos = eligible.map((v) => ({
    code: v.code,
    description: v.description || `${v.discount_value}${v.discount_type === 'percent' ? '%' : ''} off`,
    discountType: v.discount_type === 'percent' ? 'percentage' : 'fixed',
    discountValue: v.discount_value,
    minBookingAmount: v.min_booking_amount || null,
    maxDiscountAmount: v.max_discount_amount || null,
    category: v.category,
    validUntil: v.valid_until,
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
