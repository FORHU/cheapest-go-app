import type { DbClient } from '@/lib/db/query-builder';
import type { User } from '@/types/auth';
import { createAdminClient } from '@/utils/postgres/admin';
import {
  amendBookingSchema,
  saveBookingSchema,
} from '@/lib/schemas';
import { bookTravelgateX, cancelTravelgateX } from './travelgatex';
import { runTgxSearch } from '@/lib/server/stays/travelgatex/search';
import { getSqlAdmin } from '@/lib/db/postgres';
import { invokeEdgeFunction } from '@/utils/postgres/functions';

import { stripe } from '@/lib/stripe/server';
import { sendHotelRefundEmail } from './email';
import type {
  AmendBookingParams,
  SaveBookingParams,
  CancelBookingResult,
  AmendBookingResult,
  BookingDetailsResult,
  GetUserBookingsResult,
} from './types';

export interface ConfirmAndSaveResult {
  success: boolean;
  /** True when provider confirmed the booking but our DB save failed — do NOT refund Stripe */
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
  supabase: DbClient,
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
// TravelgateX: Confirm booking + save
// ============================================================================

function parseTgxToken(token: string): { hotelCode: string | null; checkIn: string | null; checkOut: string | null } {
  const segs: Record<string, string> = {};
  for (const seg of token.split('!~|')) {
    if (seg.length > 1) segs[seg[0]] = seg.slice(1);
  }
  const parseYYMMDD = (v: string | undefined): string | null => {
    if (!v || v.length !== 6) return null;
    return `20${v.slice(0, 2)}-${v.slice(2, 4)}-${v.slice(4, 6)}`;
  };
  return { hotelCode: segs['d'] || null, checkIn: parseYYMMDD(segs['b']), checkOut: parseYYMMDD(segs['c']) };
}

async function getFreshTgxToken(expiredToken: string, adults: number, children: number, currency: string): Promise<string | null> {
  const { hotelCode, checkIn, checkOut } = parseTgxToken(expiredToken);
  console.log('[getFreshTgxToken] Parsed token → hotel:', hotelCode, 'in:', checkIn, 'out:', checkOut);
  if (!hotelCode || !checkIn || !checkOut) {
    console.error('[getFreshTgxToken] Could not parse hotel/dates from token:', expiredToken.substring(0, 80));
    return null;
  }
  try {
    // In-process search (was an HTTP self-call to /api/fn/travelgatex-search).
    const result = await runTgxSearch({
      hotelCode, checkin: checkIn, checkout: checkOut, adults, children, currency, guest_nationality: 'KR',
    });
    const rooms: any[] = result?.data?.roomTypes || [];
    console.log('[getFreshTgxToken] Fresh search → rooms found:', rooms.length);
    const freshRoom = rooms[0];
    const freshOfferId: string = freshRoom?.offerId || '';
    if (!freshOfferId.startsWith('TGX:')) {
      console.error('[getFreshTgxToken] No valid TGX offerId in fresh search. offerId:', freshOfferId.substring(0, 60));
      return null;
    }
    const freshOptionId = freshOfferId.slice(4);
    const freshNativeToken: string = freshRoom?.rates?.[0]?._tgx?.token || freshOptionId;
    console.log('[getFreshTgxToken] opt.id:', freshOptionId.substring(0, 60), '| opt.token:', freshNativeToken.substring(0, 60));

    await new Promise(resolve => setTimeout(resolve, 1500));

    const tokensToTry = freshNativeToken !== freshOptionId
      ? [freshNativeToken, freshOptionId]
      : [freshOptionId];

    for (const tok of tokensToTry) {
      try {
        const quoteResult = await invokeEdgeFunction('travelgatex-quote', { token: tok });
        const bookToken: string = quoteResult?.data?.optionRefId || tok;
        console.log('[getFreshTgxToken] Quote succeeded | quoted:', tok.substring(0, 60), '| bookToken:', bookToken.substring(0, 60));
        return bookToken;
      } catch (qErr: any) {
        console.warn('[getFreshTgxToken] Quote failed for token', tok.substring(0, 40), ':', qErr.message?.substring(0, 150));
      }
    }
    console.error('[getFreshTgxToken] All Quote attempts failed — cannot proceed with Book');
    return null;
  } catch (err: any) {
    console.error('[getFreshTgxToken] Unexpected error:', err.message?.substring(0, 200));
    return null;
  }
}

export interface TgxConfirmInput {
  quoteToken: string;
  holder: { firstName: string; lastName: string; email: string };
  guests: Array<{ firstName: string; lastName: string; age?: number }>;
  propertyName: string;
  propertyImage?: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  currency: string;
  specialRequests?: string;
  paymentIntentId?: string;
  voucherCode?: string;
  discountAmount?: number;
  cancellationPolicies?: any;
}

export async function confirmAndSaveTgxBooking(
  params: TgxConfirmInput,
  user: User,
): Promise<ConfirmAndSaveResult> {
  const clientReference = `FORHU-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

  // Build paxes: adults first (use individual names from form), then children
  const adultPaxes = Array(params.adults).fill(null).map((_, i) => ({
    name: params.guests[i]?.firstName || params.holder.firstName,
    surname: params.guests[i]?.lastName || params.holder.lastName,
    age: 30,
  }));
  const childPaxes = Array(params.children).fill(null).map((_, i) => ({
    name: params.guests[params.adults + i]?.firstName || `Child${i + 1}`,
    surname: params.guests[params.adults + i]?.lastName || params.holder.lastName,
    age: (params.guests[params.adults + i] as any)?.age || 10,
  }));

  let tgxResult: any;
  let activeToken = params.quoteToken;
  try {
    tgxResult = await bookTravelgateX({
      quoteToken: activeToken,
      clientReference,
      holder: params.holder,
      rooms: [{ occupancyRefId: 1, paxes: [...adultPaxes, ...childPaxes] }],
    });
  } catch (firstError: any) {
    const msg = firstError?.message || '';
    const isExpired = /option not found|not found in|expired|unavailable|301|wrong_field|quote.*option|search.*found/i.test(msg);
    if (isExpired) {
      console.log('[confirmAndSaveTgxBooking] Token expired, retrying with fresh search...');
      const freshToken = await getFreshTgxToken(activeToken, params.adults, params.children, params.currency);
      if (freshToken) {
        activeToken = freshToken;
        try {
          tgxResult = await bookTravelgateX({
            quoteToken: freshToken,
            clientReference,
            holder: params.holder,
            rooms: [{ occupancyRefId: 1, paxes: [...adultPaxes, ...childPaxes] }],
          });
        } catch (retryError: any) {
          console.error('[confirmAndSaveTgxBooking] Retry also failed:', retryError.message);
          return { success: false, error: retryError instanceof Error ? retryError.message : 'TravelgateX booking failed after retry' };
        }
      } else {
        return { success: false, error: 'Room is no longer available for these dates' };
      }
    } else {
      console.error('[confirmAndSaveTgxBooking] TGX book failed:', firstError);
      return { success: false, error: firstError instanceof Error ? firstError.message : 'TravelgateX booking failed' };
    }
  }

  const booking = tgxResult?.data;
  // travelgatex-book route returns flat clientRef/supplierRef/hotelRef fields
  const clientRef = booking?.clientRef || booking?.reference?.client;
  if (!clientRef) {
    console.error('[confirmAndSaveTgxBooking] No reference in TGX response:', tgxResult);
    return { success: false, error: 'Booking failed — no reference returned from TravelgateX' };
  }

  const bookingId = clientRef; // our clientReference
  const supplierRef = booking?.supplierRef || booking?.reference?.supplier;
  const hotelRef = booking?.hotelRef || booking?.reference?.hotel;
  const hotelCode = booking?.hotelCode ?? null;
  const rawStatus = (booking.status || 'confirmed').toLowerCase();
  const bookingStatus = (['confirmed', 'pending'].includes(rawStatus) ? rawStatus : 'confirmed') as 'confirmed' | 'pending';

  console.log(JSON.stringify({
    _event: 'tgx_confirmed',
    bookingId,
    clientReference,
    supplierRef,
    userId: user.id,
    holderEmail: params.holder.email,
    propertyName: params.propertyName,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    timestamp: new Date().toISOString(),
  }));

  const price = booking.price?.gross || booking.price?.net || 0;
  const currency = booking.price?.currency || params.currency || 'USD';

  let totalPrice = price;
  if (params.paymentIntentId) {
    try {
      const pi = await stripe.paymentIntents.retrieve(params.paymentIntentId);
      totalPrice = pi.amount / 100;
    } catch {
      totalPrice = price;
    }
  }

  // Prefer the prebook cancel policy (quote-time, shown to user at checkout) over the
  // book response — TGX suppliers sometimes return refundable:false at book time even
  // when the quote showed a free-cancellation window.
  const prebookPolicy = params.cancellationPolicies;
  const isRefundable = prebookPolicy
    ? prebookPolicy.refundableTag === 'RFN'
    : booking.cancelPolicy?.refundable === true;
  const policyType = isRefundable ? 'free_cancellation' : 'non_refundable';
  const storedCancelPolicy = prebookPolicy ?? (booking.cancelPolicy ? {
    refundableTag: isRefundable ? 'RFN' : 'NRFN',
    cancelPolicyInfos: (booking.cancelPolicy.cancelPenalties || []).map((p: any) => ({
      cancelTime: p.deadline,
      amount: p.value ?? 0,
      currency: p.currency || currency,
      type: p.penaltyType || 'AMOUNT',
    })),
  } : null);

  // Look up stored coordinates from hotel_content — avoids client-side geocoding on /trips
  let property_lat = 0;
  let property_lng = 0;
  if (hotelCode) {
    try {
      const sql = getSqlAdmin();
      const rows = await sql`
        SELECT lat, lng FROM hotel_content
        WHERE hotel_id = ${hotelCode} AND lat != 0 AND lng != 0
        LIMIT 1
      `;
      if (rows[0]) { property_lat = rows[0].lat; property_lng = rows[0].lng; }
    } catch { /* non-fatal — map will fall back to geocoding */ }
  }

  // Build outside try so the catch block can reference it for emergency recovery
  const bookingPayload = {
    booking_id: bookingId,
    user_id: user.id,
    property_name: params.propertyName,
    property_image: params.propertyImage ?? null,
    property_lat,
    property_lng,
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
    policy_type: policyType,
    source_brand: process.env.NEXT_PUBLIC_BRAND_NAME ?? 'CheapestGo',
  };

  try {
    const serviceClient = createAdminClient();

    const snapshotPayload = {
      policy_type: policyType,
      summary: isRefundable ? 'Refundable rate' : 'Non-refundable rate',
      refundable_tag: isRefundable ? 'RFN' : 'NRFN',
      hotel_remarks: [],
      no_show_penalty: 0,
      early_departure_fee: 0,
      free_cancel_deadline: booking.cancelPolicy?.cancelPenalties?.[0]?.deadline ?? null,
      raw_liteapi_response: booking,
    };

    const tiersPayload = (booking.cancelPolicy?.cancelPenalties || []).map((p: any) => ({
      cancel_deadline: p.deadline,
      penalty_amount: p.value,
      penalty_type: p.penaltyType,
      currency: p.currency || currency,
    }));

    const { error: rpcError } = await serviceClient.rpc('create_booking_with_policy', {
      p_booking: bookingPayload,
      p_snapshot: snapshotPayload,
      p_tiers: tiersPayload,
    });

    if (rpcError) {
      console.error('[confirmAndSaveTgxBooking] RPC failed after TGX confirmed — attempting fallback INSERT:', rpcError);

      // Fallback: direct INSERT without policy tiers. The booking is saved with
      // basic fields so cancellation/refund can still be processed. Cancel policy
      // will be marked incomplete for manual ops review.
      const { error: fallbackError } = await serviceClient
        .from('bookings')
        .insert({
          ...bookingPayload,
          // Tag as incomplete so ops can identify and patch cancel tiers
          special_requests: [bookingPayload.special_requests, '[POLICY_TIERS_MISSING — see RPC error log]']
            .filter(Boolean).join(' | '),
        });

      if (!fallbackError) {
        // Patch provider/financial columns separately (same as the happy path below)
        await serviceClient
          .from('bookings')
          .update({
            provider: 'travelgatex',
            provider_metadata: { supplierRef, hotelRef, hotelCode, clientReference },
            payment_intent_id: params.paymentIntentId ?? null,
            supplier_cost: price,
            charged_price: totalPrice,
            cancellation_policy: storedCancelPolicy ?? null,
          })
          .eq('booking_id', bookingId);

        console.warn(
          '[confirmAndSaveTgxBooking] Fallback INSERT succeeded for', bookingId,
          '— cancel policy tiers missing, manual review required'
        );
        return {
          success: true,
          data: { bookingId, status: bookingStatus, policyType, policySummary: snapshotPayload.summary, totalPrice, currency },
        };
      }

      // Both RPC and direct INSERT failed — truly orphaned booking
      console.error(
        'CRITICAL: TGX booking', bookingId,
        'confirmed but ALL DB saves failed. Supplier ref:', supplierRef,
        'PI:', params.paymentIntentId, '— Manual reconciliation required.',
      );
      return {
        success: false,
        providerConfirmed: true,
        data: { bookingId, status: bookingStatus, policyType, policySummary: snapshotPayload.summary, totalPrice, currency },
        error: `Booking confirmed but failed to save (DB: ${rpcError.message || rpcError.code}). Contact support with booking ID: ${bookingId}`,
      };
    }

    // Update provider columns and financial audit fields (RPC INSERT uses defaults; patch here).
    // Also set cancellation_policy to the normalized format — the RPC stores raw_liteapi_response
    // in that column, but the trips page expects { refundableTag, cancelPolicyInfos }.
    const { error: updateError } = await serviceClient
      .from('bookings')
      .update({
        provider: 'travelgatex',
        provider_metadata: { supplierRef, hotelRef, hotelCode, clientReference },
        payment_intent_id: params.paymentIntentId ?? null,
        supplier_cost: price,
        charged_price: totalPrice,
        cancellation_policy: storedCancelPolicy ?? null,
      })
      .eq('booking_id', bookingId);

    if (updateError) {
      // Non-fatal: booking is confirmed and RPC-saved. Log for ops but don't fail the response.
      console.error(
        '[confirmAndSaveTgxBooking] Post-RPC update failed for', bookingId,
        '— provider_metadata and cancellation_policy may be missing. Error:', updateError.message || updateError.code,
        '| supplierRef:', supplierRef, '| PI:', params.paymentIntentId,
      );
    }

    if (params.paymentIntentId) {
      stripe.paymentIntents.update(params.paymentIntentId, {
        metadata: { bookingId },
      }).catch(e => console.warn('[confirmAndSaveTgxBooking] PI metadata update failed (non-critical):', e.message));
    }

    return {
      success: true,
      data: { bookingId, status: bookingStatus, policyType, policySummary: snapshotPayload.summary, totalPrice, currency },
    };
  } catch (error) {
    console.error('[confirmAndSaveTgxBooking] DB error after TGX confirmed — attempting emergency INSERT:', error);
    // Last-resort: insert a minimal record so the booking is at least traceable
    try {
      const serviceClient = createAdminClient();
      await serviceClient.from('bookings').insert({
        ...bookingPayload,
        provider: 'travelgatex',
        provider_metadata: { supplierRef, hotelRef, hotelCode, clientReference },
        payment_intent_id: params.paymentIntentId ?? null,
        supplier_cost: price,
        charged_price: totalPrice,
        cancellation_policy: storedCancelPolicy ?? null,
        special_requests: [bookingPayload.special_requests, '[EMERGENCY_RECOVERY — exception during save]']
          .filter(Boolean).join(' | '),
      });
      console.warn('[confirmAndSaveTgxBooking] Emergency INSERT succeeded for', bookingId);
      return {
        success: true,
        data: { bookingId, status: bookingStatus, policyType, policySummary: isRefundable ? 'Refundable' : 'Non-refundable', totalPrice, currency },
      };
    } catch (emergencyErr) {
      console.error('CRITICAL: Emergency INSERT also failed for', bookingId, ':', emergencyErr);
    }
    return {
      success: false,
      providerConfirmed: true,
      data: { bookingId, status: bookingStatus, policyType, policySummary: isRefundable ? 'Refundable' : 'Non-refundable', totalPrice, currency },
      error: 'Booking confirmed but failed to save. Contact support with booking ID: ' + bookingId,
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
  supabase: DbClient
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
    let paymentIntentId = paymentRow?.payment_intent_id as string | null;

    // Fallback: search Stripe by booking metadata when PI not stored on record
    if (!paymentIntentId) {
      console.warn(`[cancelBooking] No payment_intent_id on booking ${bookingId} — searching Stripe by metadata`);
      try {
        const searchResult = await stripe.paymentIntents.search({
          query: `metadata['bookingId']:'${bookingId}'`,
          limit: 1,
        });
        if (searchResult.data.length > 0) {
          paymentIntentId = searchResult.data[0].id;
          console.log(`[cancelBooking] Found PI via Stripe search: ${paymentIntentId}`);
          // Persist it so future operations don't need to search again
          await supabase.from('bookings').update({ payment_intent_id: paymentIntentId }).eq('booking_id', bookingId);
        } else {
          console.error(`[cancelBooking] No PI found in Stripe for booking ${bookingId} — manual refund required`);
        }
      } catch (searchErr) {
        console.error(`[cancelBooking] Stripe search failed for booking ${bookingId}:`, searchErr);
      }
    }

    // 4. Cancel with the appropriate provider
    const { data: bookingRow } = await supabase
      .from('bookings')
      .select('status, provider, provider_metadata, property_name')
      .eq('booking_id', bookingId)
      .single();
    const isRefundRetry = bookingRow?.status === 'cancelled_refund_failed';
    const isTgx = bookingRow?.provider === 'travelgatex';

    if (!isRefundRetry) {
      if (isTgx) {
        const meta = bookingRow?.provider_metadata as any;

        // hotelCode is stored in provider_metadata for bookings made after this fix.
        // For older bookings: try three fallbacks in order.
        let cancelHotelCode: string | undefined = meta?.hotelCode;
        if (!cancelHotelCode && bookingRow?.property_name) {
          const propName = bookingRow.property_name as string;

          // 1. property_name IS the hotel code when hotel wasn't in hotel_content at booking time
          //    (the UI falls back to showing the numeric ID as the name).
          if (/^\d+$/.test(propName) || /^[A-Z]{2}\d+$/.test(propName)) {
            cancelHotelCode = propName;
            console.log('[cancelBooking] hotelCode derived from property_name (ID fallback):', cancelHotelCode);
          } else {
            // 2. Look up hotel_content by exact hotel_id match (name stored as ID)
            //    then fall back to ILIKE on the hotel name.
            const sql = getSqlAdmin();
            const rows = await sql`
              SELECT hotel_id FROM hotel_content
              WHERE hotel_id = ${propName}
                 OR name ILIKE ${propName}
              LIMIT 1
            `;
            cancelHotelCode = rows[0]?.hotel_id ?? undefined;
            if (cancelHotelCode) {
              console.log('[cancelBooking] hotelCode resolved from hotel_content:', cancelHotelCode);
            } else {
              console.warn('[cancelBooking] hotelCode not found — cancellation may fail. property_name:', propName);
            }
          }
        }

        // Supplier 207 "Request not accepted by supplier" means non-refundable/past-deadline —
        // proceed with our internal cancel regardless; log the outcome for ops review.
        try {
          const result = await cancelTravelgateX({
            clientReference: bookingId,
            supplierReference: meta?.supplierRef,
            hotelCode: cancelHotelCode,
          });
          console.log('[cancelBooking] TGX cancellation result:', result?.data);
        } catch (tgxErr: any) {
          console.warn('[cancelBooking] TGX cancel failed (proceeding with internal cancel):', tgxErr.message?.slice(0, 200));
        }
      }
    } else {
      console.log('[cancelBooking] Skipping provider cancel call — retrying Stripe refund for cancelled_refund_failed booking');
    }
    const liteApiInfo: LiteApiRefundInfo = {};

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
          const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
          const piAmount = pi.amount;
          const piCurrency = pi.currency.toLowerCase();
          const calcCurrency = calculation.currency.toLowerCase();
          let refundAmountCents: number;

          console.log(`[cancelBooking:stripe] PI retrieved: id=${paymentIntentId} status=${pi.status} amount=${piAmount} currency=${piCurrency}`);
          console.log(`[cancelBooking:stripe] Calculation: refundAmount=${calculation.refundAmount} penaltyAmount=${calculation.penaltyAmount} currency=${calcCurrency}`);

          // Always use piAmount as the basis — it's what the customer actually paid (includes markup).
          // Supplier price in total_price/calculation may be lower; refunding it would shortchange the customer.
          if (calcCurrency === piCurrency) {
            if (calculation.penaltyAmount > 0) {
              const refundRatio = calculation.refundAmount / (calculation.refundAmount + calculation.penaltyAmount);
              refundAmountCents = Math.round(piAmount * refundRatio);
              console.log(`[cancelBooking:stripe] Currencies match (${piCurrency}), penalty ratio=${refundRatio.toFixed(4)} → refundAmountCents=${refundAmountCents}`);
            } else {
              refundAmountCents = piAmount;
              console.log(`[cancelBooking:stripe] Currencies match (${piCurrency}), no penalty → full PI refund: refundAmountCents=${refundAmountCents}`);
            }
            refundAmountCents = Math.min(refundAmountCents, piAmount);
          } else {
            console.log(`[cancelBooking:stripe] Currency mismatch: calc=${calcCurrency} pi=${piCurrency} — using penalty ratio`);
            if (calculation.penaltyAmount > 0) {
              const refundRatio = calculation.refundAmount / (calculation.refundAmount + calculation.penaltyAmount);
              refundAmountCents = Math.round(piAmount * refundRatio);
              console.log(`[cancelBooking:stripe] Ratio=${refundRatio.toFixed(4)} → refundAmountCents=${refundAmountCents}`);
            } else {
              refundAmountCents = piAmount;
              console.log(`[cancelBooking:stripe] No penalty → full refund: refundAmountCents=${refundAmountCents}`);
            }
            refundAmountCents = Math.min(refundAmountCents, piAmount);
          }

          console.log(`[cancelBooking:stripe] Creating refund: amount=${refundAmountCents} ${piCurrency} cents (idempotencyKey=hotel-refund-${bookingId})`);
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
      await processRefund(supabase, refundLogId, { ...liteApiInfo, stripeRefundId });
      // Source of truth: Stripe gave us a refund ID = customer was refunded. DB recording success is secondary.
      const refundSucceeded = !!stripeRefundId;
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
  supabase: DbClient
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

    return { success: true, data: { bookingId: validation.data.bookingId, status: 'confirmed' } };
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
  supabase: DbClient
): Promise<BookingDetailsResult> {
  if (!bookingId || typeof bookingId !== 'string' || bookingId.trim().length === 0) {
    return { success: false, error: 'Booking ID is required' };
  }

  try {
    // Verify ownership and fetch provider info in one query
    const { data: bookingRow, error: fetchError } = await supabase
      .from('bookings')
      .select('user_id, provider, policy_type, cancellation_policy')
      .eq('booking_id', bookingId)
      .single();

    if (fetchError || !bookingRow) {
      return { success: false, error: 'Booking not found' };
    }
    if (bookingRow.user_id !== user.id) {
      return { success: false, error: 'Not authorized to view this booking' };
    }

    // TravelgateX bookings: policy is stored locally — no external API call needed
    if (bookingRow.provider === 'travelgatex') {
      const isRefundable = bookingRow.policy_type === 'free_cancellation';
      const stored = bookingRow.cancellation_policy as any;
      const cancellationPolicies = stored ?? {
        refundableTag: isRefundable ? 'RFN' : 'NRFN',
        cancelPolicyInfos: [],
        hotelRemarks: [],
      };
      return {
        success: true,
        data: {
          bookingId,
          status: 'confirmed',
          hotel: { name: '', hotelId: '' },
          bookedRooms: [],
          guestInfo: { guestFirstName: '', guestLastName: '', guestEmail: '' },
          checkin: '',
          checkout: '',
          cancellationPolicies,
        },
      };
    }

    return { success: false, error: 'Booking details not available for this provider' };
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
  supabase: DbClient
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
      property_image: data.propertyImage ?? null,
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
      special_requests: data.specialRequests ?? null,
      cancellation_policy: data.cancellationPolicy ?? null,
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
  supabase: DbClient
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
