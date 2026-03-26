import type { SupabaseClient, User } from '@supabase/supabase-js';
import {
  prebookSchema,
  bookingConfirmSchema,
  amendBookingSchema,
  saveBookingSchema,
} from '@/lib/schemas';
import type {
  PrebookParams,
  BookingParams,
  AmendBookingParams,
  SaveBookingParams,
  PrebookResult,
  BookingResult,
  CancelBookingResult,
  AmendBookingResult,
  BookingDetailsResult,
  GetUserBookingsResult,
} from './types';
import {
  parseOndaOfferId,
  ondaCheckAvail,
  ondaGetRefundPolicy,
  ondaCreateBooking,
  ondaCancelBooking,
} from './onda';

// Input type for the unified confirm + save flow
export interface ConfirmAndSaveInput {
  // ONDA booking params
  prebookId: string;
  holder: { firstName: string; lastName: string; email: string };
  guests: Array<{
    occupancyNumber: number;
    firstName: string;
    lastName: string;
    email: string;
    remarks?: string;
  }>;
  payment: { method: string; transactionId?: string };
  /** Stripe PaymentIntent ID — confirm route verifies payment before calling ONDA */
  paymentIntentId?: string;
  // Property metadata (for DB record)
  propertyName: string;
  propertyImage?: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  currency: string;
  specialRequests?: string;
  // Voucher info (optional)
  voucherCode?: string;
  discountAmount?: number;
  /** User-facing price in their selected currency (from Stripe PI or checkout store) */
  totalAmount?: number;
}

export interface ConfirmAndSaveResult {
  success: boolean;
  /** True when ONDA confirmed the booking but our DB save failed.
   *  The hotel IS booked — do NOT refund Stripe in this case. */
  providerConfirmed?: boolean;
  data?: {
    bookingId: string;
    status: string;
    policyType: string;
    policySummary: string;
    totalPrice?: number;
    currency?: string;
  };
  error?: string;
}


// ============================================================================
// Ownership verification
// ============================================================================

export async function verifyBookingOwnership(
  supabase: SupabaseClient,
  bookingId: string,
  userId: string,
): Promise<{ isOwner: boolean; error?: string }> {
  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('user_id')
    .eq('booking_id', bookingId)
    .single();

  if (fetchError || !booking) {
    return { isOwner: false, error: 'Booking not found' };
  }

  if (booking.user_id !== userId) {
    return { isOwner: false, error: 'Not authorized' };
  }

  return { isOwner: true };
}

// ============================================================================
// Prebook
// ============================================================================

export async function prebookRoom(params: PrebookParams): Promise<PrebookResult> {
  const validation = prebookSchema.safeParse(params);
  if (!validation.success) {
    const firstError = validation.error.issues[0];
    return { success: false, error: firstError?.message || 'Invalid input' };
  }

  const { offerId } = validation.data;
  const ids = parseOndaOfferId(offerId);
  if (!ids) {
    return { success: false, error: 'Invalid offer. Please go back and select the room again.' };
  }

  try {
    // Verify real-time availability
    const avail = await ondaCheckAvail(ids.propertyId, ids.roomtypeId, ids.rateplanId, ids.checkin, ids.checkout);
    if (!avail.availability) {
      return { success: false, error: 'This room is no longer available for the selected dates.' };
    }

    // Fetch dynamic cancellation policy
    const policyData = await ondaGetRefundPolicy(ids.propertyId, ids.roomtypeId, ids.rateplanId, ids.checkin, ids.checkout);
    const refundPolicy = policyData.refund_policy ?? [];

    // Build cancellation policies in the app's expected format
    const cancelPolicies = refundPolicy.map(p => ({
      cancelTime: p.until,
      amount: p.charge_amount ?? 0,
      currency: 'KRW',
      type: p.percent === 100 ? 'FREE' : p.percent === 0 ? 'NO_REFUND' : 'PARTIAL',
    }));

    const isRefundable = refundPolicy.some(p => p.percent > 0);

    return {
      success: true,
      data: {
        prebookId: offerId, // encode ONDA IDs so confirm can parse them
        price: {
          subtotal: ids.krwAmount,
          taxes: 0,
          total: ids.krwAmount,
        },
        cancellationPolicies: {
          refundableTag: isRefundable ? 'RFN' : 'NRFN',
          cancelPolicyInfos: cancelPolicies,
        },
      },
    };
  } catch (err) {
    console.error('[prebookRoom] ONDA error:', err instanceof Error ? err.message : err);
    return { success: false, error: 'Failed to verify room availability. Please try again.' };
  }
}

// ============================================================================
// Confirm booking
// ============================================================================

export async function confirmBooking(params: BookingParams): Promise<BookingResult> {
  const validation = bookingConfirmSchema.safeParse(params);
  if (!validation.success) {
    const firstError = validation.error.issues[0];
    return { success: false, error: firstError?.message || 'Invalid input' };
  }

  // TODO: implement with ONDA once base URL is available
  return { success: false, error: 'Hotel booking temporarily unavailable. Please try again later.' };
}

// ============================================================================
// Confirm booking + save atomically with policy snapshot
// ============================================================================

/**
 * In-memory guard against concurrent confirm calls for the same prebookId.
 * Prevents double-click / race-condition duplicate ONDA bookings.
 *
 * LIMITATIONS (documented for future scaling):
 * - Single-instance only: Lost on server restart, doesn't work across multiple instances
 * - For multi-instance deployments, consider:
 *   1. Redis-based distributed locking (e.g., Upstash, Redis Cloud)
 *   2. DB unique constraint on prebook_id column (requires migration)
 *   3. Idempotency keys with external state store
 *
 * Current mitigation: Coolify single-instance deployment + ONDA's offerId
 * deduplication provides acceptable protection for current scale.
 */
const inflight = new Set<string>();

export async function confirmAndSaveBooking(
  params: ConfirmAndSaveInput,
  user: User,
): Promise<ConfirmAndSaveResult> {
  // 1. Validate required fields
  if (!params.prebookId) {
    return { success: false, error: 'Prebook ID is required' };
  }
  if (!params.holder?.firstName || !params.holder?.lastName || !params.holder?.email) {
    return { success: false, error: 'Holder information is incomplete' };
  }
  if (!params.guests?.length) {
    return { success: false, error: 'At least one guest is required' };
  }

  // 2a. Concurrency guard — reject if this prebookId is already being processed
  if (inflight.has(params.prebookId)) {
    return { success: false, error: 'Booking is already being processed. Please wait.' };
  }
  inflight.add(params.prebookId);

  try {
    return await _confirmAndSaveBookingInner(params, user);
  } finally {
    inflight.delete(params.prebookId);
  }
}

async function _confirmAndSaveBookingInner(
  params: ConfirmAndSaveInput,
  user: User,
): Promise<ConfirmAndSaveResult> {
  const ids = parseOndaOfferId(params.prebookId);
  if (!ids) {
    return { success: false, error: 'Invalid booking session. Please go back and select the room again.' };
  }

  // Generate a unique channel booking number
  const channelBookingNumber = `CGO-${Date.now()}-${user.id.slice(0, 6).toUpperCase()}`;

  // Build guest list in ONDA format
  const holderName = `${params.holder.firstName} ${params.holder.lastName}`.trim();
  const guests = (params.guests ?? []).map(g => ({
    name: `${g.firstName} ${g.lastName}`.trim(),
    email: g.email || params.holder.email,
    phone: '',         // ONDA field — not collected in current checkout form
    nationality: 'PH', // Default nationality — extend checkout form to collect if needed
  }));

  // Ensure at least one guest
  if (!guests.length) {
    guests.push({ name: holderName, email: params.holder.email, phone: '', nationality: 'PH' });
  }

  // Call ONDA Create Reservation
  let ondaBooking;
  try {
    ondaBooking = await ondaCreateBooking(ids.propertyId, {
      currency: 'KRW',
      channel_booking_number: channelBookingNumber,
      checkin: ids.checkin,
      checkout: ids.checkout,
      rateplans: [{
        rateplan_id: ids.rateplanId,
        amount: ids.krwAmount,
        number_of_guest: {
          adult: params.adults ?? 1,
          child_age: [], // Extend if children ages are collected
        },
        guests,
      }],
      booker: {
        name: holderName,
        email: params.holder.email,
        phone: '',
        nationality: 'PH',
        timezone: 'Asia/Manila',
      },
    });
  } catch (err) {
    console.error('[confirmBooking] ONDA create booking failed:', err instanceof Error ? err.message : err);
    return { success: false, error: 'The hotel booking could not be completed. Please try again.' };
  }

  const bookingId = ondaBooking.booking_number;
  const status = ondaBooking.status ?? 'confirmed';

  // Persist to Supabase
  const { createClient } = await import('@/utils/supabase/server');
  const supabase = await createClient();

  const refundPolicy = ondaBooking.rateplans?.[0]?.refund_policy ?? [];
  const policyText = refundPolicy.length > 0
    ? refundPolicy.map(p => `${p.percent}% refund until ${p.until}`).join('; ')
    : ondaBooking.rateplans?.[0]?.refundable ? 'Refundable' : 'Non-refundable';

  const { error: dbError } = await supabase.from('bookings').insert({
    booking_id: bookingId,
    user_id: user.id,
    property_name: params.propertyName,
    property_image: params.propertyImage ?? null,
    room_name: params.roomName,
    check_in: ids.checkin,
    check_out: ids.checkout,
    guests_adults: params.adults ?? 1,
    guests_children: params.children ?? 0,
    total_price: params.totalAmount ?? ids.krwAmount,
    currency: params.currency || 'KRW',
    holder_first_name: params.holder.firstName,
    holder_last_name: params.holder.lastName,
    holder_email: params.holder.email,
    status: status.toLowerCase(),
    special_requests: params.specialRequests ?? null,
    // Store policy + ONDA metadata as JSONB so cancel can retrieve property_id
    cancellation_policy: {
      text: policyText,
      onda_property_id: ids.propertyId,
      onda_booking_number: bookingId,
      krw_amount: ids.krwAmount,
      refund_policy: refundPolicy,
    },
  });

  if (dbError) {
    console.error('[confirmBooking] DB insert failed:', dbError.message);
    // Booking IS confirmed in ONDA — flag so the route does NOT refund Stripe
    return {
      success: false,
      providerConfirmed: true, // ONDA confirmed the booking, DB save failed
      data: {
        bookingId,
        status: status.toLowerCase(),
        policyType: refundPolicy.length > 0 ? 'RFN' : 'NRFN',
        policySummary: policyText,
        totalPrice: ids.krwAmount,
        currency: 'KRW',
      },
      error: 'Booking confirmed with hotel but could not be saved. Contact support with reference: ' + bookingId,
    };
  }

  return {
    success: true,
    data: {
      bookingId,
      status: status.toLowerCase(),
      policyType: refundPolicy.length > 0 ? 'RFN' : 'NRFN',
      policySummary: policyText,
      totalPrice: ids.krwAmount,
      currency: 'KRW',
    },
  };
}


// ============================================================================
// Cancel booking
// ============================================================================

import { calculateCancellation } from './cancellation-engine';
import { createRefundRequest, processRefund } from './refunds';

export async function cancelBooking(
  bookingId: string,
  user: User,
  supabase: SupabaseClient
): Promise<CancelBookingResult> {
  if (!bookingId || typeof bookingId !== 'string' || bookingId.trim().length === 0) {
    return { success: false, error: 'Booking ID is required' };
  }

  try {
    // 1. Verify ownership
    const { isOwner, error: ownerError } = await verifyBookingOwnership(supabase, bookingId, user.id);
    if (!isOwner) {
      return { success: false, error: ownerError || 'Not authorized to cancel this booking' };
    }

    // 2. Calculate cancellation penalty & refund
    const calculation = await calculateCancellation(supabase, bookingId);
    console.log('[cancelBooking] Calculation:', calculation);

    // 3. Call ONDA cancel API if we have the property_id stored
    const { data: bookingRow } = await supabase
      .from('bookings')
      .select('cancellation_policy, total_price, currency')
      .eq('booking_id', bookingId)
      .single();

    const ondaPropertyId: string | undefined = bookingRow?.cancellation_policy?.onda_property_id;
    const krwAmount: number = bookingRow?.cancellation_policy?.krw_amount ?? 0;

    if (ondaPropertyId) {
      try {
        await ondaCancelBooking(ondaPropertyId, bookingId, {
          canceled_by: 'user',
          reason: 'User requested cancellation',
          currency: 'KRW',
          total_amount: krwAmount,
          refund_amount: calculation.refundAmount ?? 0,
        });
        console.log('[cancelBooking] ONDA cancel succeeded for', bookingId);
      } catch (ondaErr) {
        console.error('[cancelBooking] ONDA cancel API failed (proceeding with DB cancel):', ondaErr instanceof Error ? ondaErr.message : ondaErr);
      }
    } else {
      console.log('[cancelBooking] No ONDA property_id found — skipping provider cancel for', bookingId);
    }

    // 3. Handle Refund Logic
    if (calculation.refundable && calculation.refundAmount > 0) {
      const { success: reqSuccess, refundLogId, error: reqError } =
        await createRefundRequest(supabase, bookingId, calculation);

      if (!reqSuccess || !refundLogId) {
        console.error('[cancelBooking] Failed to create refund request:', reqError);
        const status = 'cancelled_refund_failed';
        await supabase
          .from('bookings')
          .update({ status, updated_at: new Date().toISOString() })
          .eq('booking_id', bookingId);
        return { success: true, data: { bookingId, status, message: 'Cancelled, but refund logging failed. Contact support.' } };
      }

      const processResult = await processRefund(supabase, refundLogId, {});
      const status = processResult.success ? 'cancelled_refunded' : 'cancelled_refund_failed';
      const message = processResult.success
        ? 'Booking cancelled and refund processed.'
        : 'Booking cancelled. Refund recording failed — contact support.';

      return {
        success: true,
        data: {
          bookingId, status, message,
          refund: { id: refundLogId, amount: calculation.refundAmount, currency: calculation.currency, status: processResult.success ? 'processed' : 'failed' }
        }
      };
    } else {
      const status = 'cancelled';
      await supabase
        .from('bookings')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('booking_id', bookingId);
      return { success: true, data: { bookingId, status, message: 'Booking cancelled. Non-refundable.' } };
    }
  } catch (error) {
    console.error('[cancelBooking] Error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Cancellation failed' };
  }
}


// ============================================================================
// Amend booking
// ============================================================================

export async function amendBooking(
  params: AmendBookingParams,
  user: User,
  supabase: SupabaseClient
): Promise<AmendBookingResult> {
  const validation = amendBookingSchema.safeParse(params);
  if (!validation.success) {
    const firstError = validation.error.issues[0];
    return { success: false, error: firstError?.message || 'Invalid input' };
  }

  try {
    const { isOwner, error: ownerError } = await verifyBookingOwnership(supabase, validation.data.bookingId, user.id);
    if (!isOwner) {
      return { success: false, error: ownerError || 'Not authorized to modify this booking' };
    }

    // TODO: call ONDA amend API once base URL is available.
    // For now, update local DB only.
    await supabase
      .from('bookings')
      .update({
        holder_first_name: validation.data.firstName,
        holder_last_name: validation.data.lastName,
        holder_email: validation.data.email,
        special_requests: validation.data.remarks,
        updated_at: new Date().toISOString(),
      })
      .eq('booking_id', validation.data.bookingId);

    return { success: true, data: { bookingId: validation.data.bookingId, status: 'updated' } };
  } catch (error) {
    console.error('[amendBooking] Error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Amendment failed' };
  }
}

// ============================================================================
// Get booking details
// ============================================================================

export async function getBookingDetails(
  bookingId: string,
  user: User,
  supabase: SupabaseClient
): Promise<BookingDetailsResult> {
  if (!bookingId || typeof bookingId !== 'string' || bookingId.trim().length === 0) {
    return { success: false, error: 'Booking ID is required' };
  }

  try {
    // Verify ownership
    const { isOwner, error: ownerError } = await verifyBookingOwnership(supabase, bookingId, user.id);
    if (!isOwner) {
      return { success: false, error: ownerError || 'Not authorized to view this booking' };
    }

    // TODO: fetch live details from ONDA once base URL is available.
    // For now return from DB only.
    const { data, error } = await supabase.from('bookings').select('*').eq('booking_id', bookingId).single();
    if (error || !data) return { success: false, error: 'Booking not found' };
    return { success: true, data };
  } catch (error) {
    console.error('[getBookingDetails] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get booking details',
    };
  }
}

// ============================================================================
// Save booking to database
// ============================================================================

export async function saveBookingToDatabase(
  params: SaveBookingParams,
  user: User,
  supabase: SupabaseClient
): Promise<{ success: boolean; error?: string }> {
  const validation = saveBookingSchema.safeParse(params);
  if (!validation.success) {
    const firstError = validation.error.issues[0];
    return { success: false, error: firstError?.message || 'Invalid input' };
  }

  try {
    const data = validation.data;

    const { error: insertError } = await supabase.from('bookings').insert({
      booking_id: data.bookingId,
      user_id: user.id,
      property_name: data.propertyName,
      property_image: data.propertyImage,
      room_name: data.roomName,
      check_in: data.checkIn,
      check_out: data.checkOut,
      guests_adults: data.adults,
      guests_children: data.children,
      total_price: data.totalPrice,
      currency: data.currency,
      holder_first_name: data.holderFirstName,
      holder_last_name: data.holderLastName,
      holder_email: data.holderEmail,
      status: 'confirmed',
      special_requests: data.specialRequests,
      cancellation_policy: data.cancellationPolicy,
    });

    if (insertError) {
      console.error('[saveBookingToDatabase] Error:', insertError);
      return { success: false, error: 'Failed to save booking' };
    }

    return { success: true };
  } catch (error) {
    console.error('[saveBookingToDatabase] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save booking',
    };
  }
}

// ============================================================================
// Get user bookings
// ============================================================================

export async function getUserBookings(
  user: User,
  supabase: SupabaseClient
): Promise<GetUserBookingsResult> {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[getUserBookings] Error:', error);
      return { success: false, error: 'Failed to fetch bookings' };
    }

    return { success: true, data: data || [] };
  } catch (error) {
    console.error('[getUserBookings] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch bookings',
    };
  }
}
