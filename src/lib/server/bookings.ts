import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { env } from "@/utils/env";
import {
  prebookSchema,
  bookingConfirmSchema,
  amendBookingSchema,
  saveBookingSchema,
} from '@/lib/schemas';
import {
  prebookLiteApi,
  bookLiteApi,
  cancelBookingLiteApi,
  amendBookingLiteApi,
  getBookingDetailsLiteApi,
} from './liteapi';
import { normalizeLiteApiPolicy } from './policy-normalizer';
import { stripe } from '@/lib/stripe/server';
import { sendHotelRefundEmail } from './email';
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
  CancellationPolicy,
} from './types';

// Input type for the unified confirm + save flow
export interface ConfirmAndSaveInput {
  // LiteAPI booking params
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
  /** Stripe PaymentIntent ID — confirm route verifies payment before calling LiteAPI */
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
}

export interface ConfirmAndSaveResult {
  success: boolean;
  /** True when LiteAPI confirmed the booking but our DB save failed.
   *  The hotel IS booked — do NOT refund Stripe in this case. */
  liteApiConfirmed?: boolean;
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

  try {
    const result = await prebookLiteApi(validation.data);
    return { success: true, data: result.data };
  } catch (error) {
    console.error('[prebookRoom] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Prebook failed',
    };
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

  try {
    const result = await bookLiteApi(validation.data);
    return { success: true, data: result.data };
  } catch (error) {
    console.error('[confirmBooking] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Booking confirmation failed',
    };
  }
}

// ============================================================================
// Confirm booking + save atomically with policy snapshot
// ============================================================================

/**
 * In-memory guard against concurrent confirm calls for the same prebookId.
 * Prevents double-click / race-condition duplicate LiteAPI bookings.
 *
 * LIMITATIONS (documented for future scaling):
 * - Single-instance only: Lost on server restart, doesn't work across multiple instances
 * - For multi-instance deployments, consider:
 *   1. Redis-based distributed locking (e.g., Upstash, Redis Cloud)
 *   2. DB unique constraint on prebook_id column (requires migration)
 *   3. Idempotency keys with external state store
 *
 * Current mitigation: Coolify single-instance deployment + LiteAPI's own prebookId
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
  // NOTE: Full DB-level idempotency (storing prebookId) would require a schema
  // migration. The in-memory concurrency guard above is the primary defense
  // against double-click duplicate bookings without DB changes.

  // 3. Call LiteAPI to confirm booking
  let liteApiResult: any;
  try {
    liteApiResult = await bookLiteApi({
      prebookId: params.prebookId,
      holder: params.holder,
      guests: params.guests,
      payment: params.payment,
    });
  } catch (error) {
    console.error('[confirmAndSaveBooking] LiteAPI call failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Booking confirmation failed',
    };
  }

  const bookingData = liteApiResult?.data;
  if (!bookingData?.bookingId) {
    console.error('[confirmAndSaveBooking] No bookingId in LiteAPI response:', liteApiResult);
    return { success: false, error: 'Booking failed — no booking ID returned' };
  }

  const bookingId = bookingData.bookingId;
  // Normalize LiteAPI status to our lowercase DB enum values
  const rawStatus = (bookingData.status || 'confirmed').toLowerCase();
  const bookingStatus = (['confirmed', 'pending', 'completed', 'cancelled'].includes(rawStatus) ? rawStatus : 'confirmed') as 'confirmed' | 'pending' | 'completed' | 'cancelled';

  // Emit an immutable audit log immediately after LiteAPI confirms — BEFORE the DB write.
  // If the process crashes between here and the RPC call, this log entry is the evidence
  // needed for manual reconciliation. Do NOT move this line below the DB write.
  console.log(JSON.stringify({
    _event: 'liteapi_confirmed',
    bookingId,
    prebookId: params.prebookId,
    userId: user.id,
    holderEmail: params.holder.email,
    propertyName: params.propertyName,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    currency: params.currency,
    timestamp: new Date().toISOString(),
  }));

  // Extract price from LiteAPI response
  const totalPrice =
    typeof bookingData.price === 'number' ? bookingData.price :
      typeof bookingData.sellingPrice === 'string' ? parseFloat(bookingData.sellingPrice) :
        bookingData.bookedRooms?.[0]?.amount ?? params.adults * 1000; // last-resort fallback

  const currency = bookingData.currency || params.currency || 'PHP';

  // 3. Normalize policy from LiteAPI response
  const rawCancellationPolicies: CancellationPolicy | null =
    bookingData.cancellationPolicies ?? null;

  const { snapshot, tiers } = normalizeLiteApiPolicy(
    bookingId,
    rawCancellationPolicies,
    bookingData, // full LiteAPI response as raw snapshot
    currency,
  );

  // 4. Atomic DB insert via service role + RPC
  try {
    const serviceClient = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
    );

    const bookingPayload = {
      booking_id: bookingId,
      user_id: user.id,
      property_name: params.propertyName,
      property_image: params.propertyImage ?? null,
      room_name: params.roomName,
      check_in: params.checkIn,
      check_out: params.checkOut,
      guests_adults: params.adults,
      guests_children: params.children ?? 0,
      total_price: totalPrice,
      currency,
      holder_first_name: params.holder.firstName,
      holder_last_name: params.holder.lastName,
      holder_email: params.holder.email,
      status: bookingStatus,
      special_requests: params.specialRequests ?? null,
      voucher_code: params.voucherCode ?? null,
      discount_amount: params.discountAmount ?? 0,
      policy_type: snapshot.policyType,
      payment_intent_id: params.paymentIntentId ?? null,
    };

    const snapshotPayload = {
      policy_type: snapshot.policyType,
      summary: snapshot.summary,
      refundable_tag: snapshot.refundableTag,
      hotel_remarks: snapshot.hotelRemarks,
      no_show_penalty: snapshot.noShowPenalty,
      early_departure_fee: snapshot.earlyDepartureFee,
      free_cancel_deadline: snapshot.freeCancelDeadline,
      raw_liteapi_response: snapshot.rawLiteapiResponse,
    };

    const tiersPayload = tiers.map(t => ({
      cancel_deadline: t.cancelDeadline,
      penalty_amount: t.penaltyAmount,
      penalty_type: t.penaltyType,
      currency: t.currency,
    }));

    const { data: rpcResult, error: rpcError } = await serviceClient
      .rpc('create_booking_with_policy', {
        p_booking: bookingPayload,
        p_snapshot: snapshotPayload,
        p_tiers: tiersPayload,
      });

    if (rpcError) {
      console.error('[confirmAndSaveBooking] DB transaction failed:', JSON.stringify({
        code: rpcError.code,
        message: rpcError.message,
        details: rpcError.details,
        hint: rpcError.hint,
      }));
      console.error('CRITICAL: Booking', bookingId, 'confirmed in LiteAPI but DB save failed. Manual reconciliation required.');
      return {
        success: false,
        liteApiConfirmed: true,
        data: {
          bookingId,
          status: bookingStatus,
          policyType: snapshot.policyType,
          policySummary: snapshot.summary ?? 'Policy details unavailable',
          totalPrice,
          currency,
        },
        error: `Booking confirmed but failed to save details (DB: ${rpcError.message || rpcError.code || 'unknown'}). Please contact support with booking ID: ${bookingId}`,
      };
    }

    console.log('[confirmAndSaveBooking] Atomic save complete:', rpcResult);

    return {
      success: true,
      data: {
        bookingId,
        status: bookingStatus,
        policyType: snapshot.policyType,
        policySummary: snapshot.summary ?? '',
        totalPrice,
        currency,
      },
    };
  } catch (error) {
    console.error('[confirmAndSaveBooking] DB error:', error);
    console.error('CRITICAL: Booking', bookingId, 'confirmed in LiteAPI but DB save threw. Manual reconciliation required.');
    return {
      success: false,
      liteApiConfirmed: true,
      data: {
        bookingId,
        status: bookingStatus,
        policyType: snapshot.policyType,
        policySummary: snapshot.summary ?? '',
        totalPrice,
        currency,
      },
      error: 'Booking confirmed but failed to save. Please contact support with booking ID: ' + bookingId,
    };
  }
}


// ============================================================================
// Cancel booking
// ============================================================================

import { calculateCancellation } from './cancellation-engine';
import { createRefundRequest, processRefund } from './refunds';
import type { LiteApiRefundInfo } from './refunds';

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

    // 3. Fetch payment_intent_id for Stripe refund
    const { data: paymentRow } = await supabase
      .from('bookings')
      .select('payment_intent_id')
      .eq('booking_id', bookingId)
      .single();
    const paymentIntentId = paymentRow?.payment_intent_id as string | null;

    // 4. Call LiteAPI to cancel (marks booking cancelled on their side)
    const result = await cancelBookingLiteApi({ bookingId });

    const liteApiInfo: LiteApiRefundInfo = {
      cancellationId: result?.data?.cancellationId,
      refund: result?.data?.refund,
    };
    console.log('[cancelBooking] LiteAPI cancellation result:', liteApiInfo);

    // 5. Handle Refund Logic
    if (calculation.refundable && calculation.refundAmount > 0) {
      // A. Log refund request
      const { success: reqSuccess, refundLogId, error: reqError } =
        await createRefundRequest(supabase, bookingId, calculation, user.id);

      if (!reqSuccess || !refundLogId) {
        console.error('[cancelBooking] Failed to create refund request:', reqError);
        await supabase.from('bookings').update({ status: 'cancelled_refund_failed', updated_at: new Date().toISOString() }).eq('booking_id', bookingId);
        return { success: true, data: { bookingId, status: 'cancelled_refund_failed', message: 'Cancelled, but refund logging failed. Contact support.' } };
      }

      // B. Issue Stripe refund — we collected payment via Stripe, LiteAPI does NOT refund on our behalf
      let stripeRefundId: string | undefined;
      let stripeError: string | undefined;

      if (paymentIntentId) {
        try {
          // Always retrieve the PI to get the exact charged amount and currency.
          // booking.currency may differ from the PI currency if LiteAPI returned a native
          // currency (e.g. USD) while the user paid in PHP. The PI is the only source of truth.
          const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
          const piAmount = pi.amount;
          const piCurrency = pi.currency.toLowerCase();
          const calcCurrency = calculation.currency.toLowerCase();
          let refundAmountCents: number;

          if (calcCurrency === piCurrency) {
            refundAmountCents = Math.min(Math.round(calculation.refundAmount * 100), piAmount);
          } else {
            // Currency mismatch — apply penalty ratio to the user's actual charge
            if (calculation.penaltyAmount > 0) {
              const refundRatio = calculation.refundAmount / (calculation.refundAmount + calculation.penaltyAmount);
              refundAmountCents = Math.round(piAmount * refundRatio);
            } else {
              refundAmountCents = piAmount; // full refund
            }
            refundAmountCents = Math.min(refundAmountCents, piAmount);
            console.warn(`[cancelBooking] Currency mismatch (calc=${calcCurrency}, pi=${piCurrency}) — refunding ${refundAmountCents} of ${piAmount} ${piCurrency} cents`);
          }

          const stripeRefund = await stripe.refunds.create({
            payment_intent: paymentIntentId,
            amount: refundAmountCents,
            reason: 'requested_by_customer',
            metadata: { bookingId, type: 'hotel_cancellation', penaltyAmount: String(calculation.penaltyAmount) },
          }, { idempotencyKey: `hotel-refund-${bookingId}` });

          if (stripeRefund.status === 'failed') {
            throw new Error(`Stripe refund created but failed: ${stripeRefund.id}`);
          }

          stripeRefundId = stripeRefund.id;
          console.log(`[cancelBooking] Stripe refund issued: ${stripeRefundId} — ${refundAmountCents} ${piCurrency} cents`);

          // Fire refund receipt email (non-blocking)
          supabase
            .from('bookings')
            .select('holder_email, holder_first_name, holder_last_name, property_name, room_name, check_in, check_out')
            .eq('booking_id', bookingId)
            .single()
            .then(({ data: b }) => {
              if (!b?.holder_email) return;
              sendHotelRefundEmail({
                bookingId,
                email: b.holder_email,
                guestName: `${b.holder_first_name || ''} ${b.holder_last_name || ''}`.trim(),
                hotelName: b.property_name || '',
                roomName: b.room_name || '',
                checkIn: b.check_in || '',
                checkOut: b.check_out || '',
                refundAmount: calculation.refundAmount,
                currency: calculation.currency,
                stripeRefundId,
              }).catch(e => console.error('[cancelBooking] Refund email failed:', e));
            });
        } catch (err: any) {
          stripeError = err.message;
          console.error('[cancelBooking] Stripe refund failed:', stripeError);
        }
      } else {
        console.warn(`[cancelBooking] No payment_intent_id on booking ${bookingId} — Stripe refund skipped. Manual refund required.`);
      }

      // C. Record result in refund_logs
      const processResult = await processRefund(supabase, refundLogId, { ...liteApiInfo, stripeRefundId });
      const refundSucceeded = stripeRefundId && processResult.success;
      const status = refundSucceeded ? 'cancelled_refunded' : 'cancelled_refund_failed';

      await supabase.from('bookings').update({ status, updated_at: new Date().toISOString() }).eq('booking_id', bookingId);

      return {
        success: true,
        data: {
          bookingId,
          status,
          message: refundSucceeded
            ? 'Booking cancelled and refund processed.'
            : `Booking cancelled. Refund ${stripeError ? `failed: ${stripeError}` : 'pending — contact support.'}`,
          refund: {
            id: refundLogId,
            amount: calculation.refundAmount,
            currency: calculation.currency,
            status: refundSucceeded ? 'processed' : 'failed',
          },
        },
      };

    } else {
      // Non-refundable
      await supabase.from('bookings').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('booking_id', bookingId);
      return { success: true, data: { bookingId, status: 'cancelled', message: 'Booking cancelled. Non-refundable.' } };
    }

  } catch (error) {
    console.error('[cancelBooking] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Cancellation failed',
    };
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
    // Verify ownership
    const { isOwner, error: ownerError } = await verifyBookingOwnership(supabase, validation.data.bookingId, user.id);
    if (!isOwner) {
      return { success: false, error: ownerError || 'Not authorized to modify this booking' };
    }

    // Call LiteAPI to amend
    const result = await amendBookingLiteApi(validation.data);

    // Update local database
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

    return { success: true, data: result.data };
  } catch (error) {
    console.error('[amendBooking] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Amendment failed',
    };
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

    const result = await getBookingDetailsLiteApi({ bookingId });
    return { success: true, data: result.data };
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

    const { error: insertError } = await supabase.from('bookings').upsert({
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
    }, { onConflict: 'booking_id', ignoreDuplicates: true });

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
