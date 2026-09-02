import type { DbClient } from '@/lib/db/query-builder';
import type { User } from '@/types/auth';
import { mintBookingReference } from '@/lib/bookingReference';
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
import { lockFx } from '@/lib/bookings/fxLock';
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
    /** DB row UUID (bookings.id) — used to link to /trips/{dbId} for manage/receipt actions. */
    dbId?: string;
    propertyAddress?: string;
    propertyCity?: string;
    propertyCountry?: string;
    starRating?: number;
    reviewRating?: number;
    reviewCount?: number;
    checkInTime?: string;
    checkOutTime?: string;
  };
  error?: string;
  errorCode?: string;
  /** Set when errorCode === 'price_changed' */
  oldPrice?: number;
  newPrice?: number;
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

function parseTgxToken(token: string): { hotelCode: string | null; checkIn: string | null; checkOut: string | null; nationality: string } {
  const segs: Record<string, string> = {};
  // Search tokens use '!~|' as separator; Quote tokens use '['.
  const separator = token.includes('!~|') ? '!~|' : '[';
  for (const seg of token.split(separator)) {
    if (seg.length > 1) segs[seg[0]] = seg.slice(1);
  }
  const parseYYMMDD = (v: string | undefined): string | null => {
    if (!v || v.length !== 6) return null;
    return `20${v.slice(0, 2)}-${v.slice(2, 4)}-${v.slice(4, 6)}`;
  };
  return { hotelCode: segs['d'] || null, checkIn: parseYYMMDD(segs['b']), checkOut: parseYYMMDD(segs['c']), nationality: segs['h'] || 'US' };
}

async function getFreshTgxToken(expiredToken: string, adults: number, children: number, currency: string): Promise<string | null> {
  const { hotelCode, checkIn, checkOut, nationality } = parseTgxToken(expiredToken);
  console.log('[getFreshTgxToken] Parsed token → hotel:', hotelCode, 'in:', checkIn, 'out:', checkOut, 'nationality:', nationality);
  if (!hotelCode || !checkIn || !checkOut) {
    console.error('[getFreshTgxToken] Could not parse hotel/dates from token:', expiredToken.substring(0, 80));
    return null;
  }
  try {
    // In-process search (was an HTTP self-call to /api/fn/travelgatex-search).
    const result = await runTgxSearch({
      hotelCode, checkin: checkIn, checkout: checkOut, adults, children, currency, guest_nationality: nationality,
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
  /** Price shown to the user at prebook/quote time (booking currency, before service fee). Used to detect price increases at book time. */
  quotedPrice?: number;
  /**
   * The reference minted before the charge and read back off the PaymentIntent, so the
   * booking is filed under the same identifier the payment carries. Absent only on a
   * booking made without a payment intent, which then falls back to a freshly minted one.
   */
  bookingReference?: string;
}

export async function confirmAndSaveTgxBooking(
  params: TgxConfirmInput,
  user: User,
): Promise<ConfirmAndSaveResult> {
  // Was `FORHU-<millis>-<rand>`. FORHU Inc owns the Stripe account every FORHU product
  // settles into, so that prefix named the one thing all of them share and could never
  // answer "which project did this money come from". The reference now names the platform,
  // and normally arrives from the PaymentIntent so the booking and the charge agree; a
  // booking made with no payment intent still needs one, hence the fallback.
  const clientReference = params.bookingReference
    ?? mintBookingReference(process.env.NEXT_PUBLIC_BRAND_NAME ?? 'CheapestGo');

  // Parse authoritative dates from the TGX token — the client-provided checkIn/checkOut
  // may be stale (e.g. from a previous session in localStorage). Token dates are canonical.
  const tokenDates = parseTgxToken(params.quoteToken);
  const checkIn  = tokenDates.checkIn  ?? params.checkIn;
  const checkOut = tokenDates.checkOut ?? params.checkOut;

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
    checkIn,
    checkOut,
    timestamp: new Date().toISOString(),
  }));

  const price = booking.price?.gross || booking.price?.net || 0;
  const currency = booking.price?.currency || params.currency || 'USD';

  // Price change guard: if TGX books at a price more than 5% above what the user
  // was quoted, reject before any DB write. The caller refunds Stripe.
  if (params.quotedPrice && params.quotedPrice > 0 && price > 0) {
    const threshold = params.quotedPrice * 1.05;
    if (price > threshold) {
      console.warn(`[confirmAndSaveTgxBooking] Price increased beyond threshold: quoted=${params.quotedPrice} booked=${price} currency=${currency}`);
      return { success: false, errorCode: 'price_changed', oldPrice: params.quotedPrice, newPrice: price };
    }
  }

  // Prefer the Stripe PI amount (what the customer actually paid) over TGX's raw
  // booking response price, which is the supplier net and does not include markup.
  // Fall back to the quoted price shown at checkout, then TGX price as last resort.
  // Also store the Stripe currency (always USD) so the trips page displays correctly —
  // TGX may return a supplier currency (e.g. 'PHP') that doesn't match the billed amount.
  let totalPrice: number;
  let storedCurrency = currency;
  if (params.paymentIntentId) {
    try {
      const pi = await stripe.paymentIntents.retrieve(params.paymentIntentId);
      totalPrice = pi.amount / 100;
      storedCurrency = (pi.currency || 'usd').toUpperCase();
    } catch {
      totalPrice = params.quotedPrice ?? price;
    }
  } else {
    totalPrice = params.quotedPrice ?? price;
  }

  // Prefer the prebook cancel policy (quote-time, shown to user at checkout) over the
  // book response — TGX suppliers sometimes return refundable:false at book time even
  // when the quote showed a free-cancellation window.
  // normalizeTgxCancelPolicy returns {} when cancelPolicy is absent — treat that as "no policy".
  const prebookPolicy = params.cancellationPolicies;
  const hasPrebookPolicy = prebookPolicy != null &&
    typeof prebookPolicy === 'object' &&
    Object.keys(prebookPolicy).length > 0;
  const isRefundable = hasPrebookPolicy
    ? (prebookPolicy.refundableTag === 'RFN' || prebookPolicy.refundableTag === 'REFUNDABLE')
    : booking.cancelPolicy?.refundable === true;
  const policyType = isRefundable ? 'free_cancellation' : 'non_refundable';
  const storedCancelPolicy = hasPrebookPolicy ? prebookPolicy : (booking.cancelPolicy ? {
    refundableTag: isRefundable ? 'RFN' : 'NRFN',
    cancelPolicyInfos: (booking.cancelPolicy.cancelPenalties || []).map((p: any) => ({
      cancelTime: p.deadline,
      amount: p.value ?? 0,
      currency: p.currency || storedCurrency,
      type: p.penaltyType || 'AMOUNT',
    })),
  } : null);

  // Look up stored coordinates + descriptive content from hotel_content — avoids
  // client-side geocoding on /trips and gives the confirmation email real address/rating data.
  interface HotelContentRow {
    address: string | null; city: string | null; country: string | null;
    star_rating: number | null; review_rating: number | null; review_count: number | null;
    check_in_time: string | null; check_out_time: string | null;
  }
  let property_lat = 0;
  let property_lng = 0;
  let hotelContent: HotelContentRow | null = null;
  if (hotelCode) {
    try {
      const sql = getSqlAdmin();
      const rows = await sql`
        SELECT lat, lng, address, city, country, star_rating, review_rating, review_count, check_in_time, check_out_time
        FROM hotel_content
        WHERE hotel_id = ${hotelCode}
        LIMIT 1
      `;
      if (rows[0]) {
        if (rows[0].lat != 0 && rows[0].lng != 0) { property_lat = rows[0].lat; property_lng = rows[0].lng; }
        hotelContent = rows[0] as unknown as HotelContentRow;
      }
    } catch { /* non-fatal — map will fall back to geocoding, email omits property details */ }
  }

  try {
    const sql = getSqlAdmin();
    const freeCancelDeadline = booking.cancelPolicy?.cancelPenalties?.[0]?.deadline ?? null;
    const cancelPenalties: any[] = booking.cancelPolicy?.cancelPenalties || [];

    // Insert booking row directly — bypasses the RPC so postgres.js tagged-template
    // literals handle all value binding, avoiding the JSON serialisation quirks of
    // the RpcBuilder that caused booking_id to arrive as null on production.
    // Columns are limited to those in the base schema; newer optional columns are
    // patched afterwards so a missing migration on production can't block the booking.
    const insertRows = await sql`
      INSERT INTO bookings (
        booking_id, user_id, property_name, property_image, room_name,
        check_in, check_out, guests_adults, guests_children,
        total_price, currency,
        holder_first_name, holder_last_name, holder_email,
        status, special_requests, voucher_code, discount_amount,
        policy_type, cancellation_policy,
        provider, provider_metadata, payment_intent_id,
        supplier_cost, charged_price
      ) VALUES (
        ${bookingId}, ${user.id}, ${params.propertyName}, ${params.propertyImage ?? null}, ${params.roomName},
        ${checkIn}::date, ${checkOut}::date,
        ${params.adults}, ${params.children ?? 0},
        ${totalPrice}, ${storedCurrency},
        ${params.holder.firstName}, ${params.holder.lastName}, ${params.holder.email},
        ${bookingStatus}, ${params.specialRequests ?? null}, ${params.voucherCode ?? null}, ${params.discountAmount ?? 0},
        ${policyType}, ${storedCancelPolicy ? JSON.stringify(storedCancelPolicy) : null}::jsonb,
        'travelgatex', ${JSON.stringify({ supplierRef, hotelRef, hotelCode, clientReference })}::jsonb,
        ${params.paymentIntentId ?? null},
        ${price}, ${totalPrice}
      )
      RETURNING id
    `;
    const dbId: string | undefined = insertRows[0]?.id;

    // Patch columns added by later migrations — non-fatal so a missing migration on
    // production doesn't roll back the booking we just confirmed with TGX.
    try {
      // Rate this booking was taken at, for USD reporting (ADR-0008). lockFx never
      // throws; if it yields nulls the row is simply counted as unconverted until
      // scripts/backfill-booking-fx.mjs resolves it.
      const fx = await lockFx(totalPrice, storedCurrency);
      await sql`
        UPDATE bookings
        SET property_lat = ${property_lat}, property_lng = ${property_lng},
            source_brand = ${process.env.NEXT_PUBLIC_BRAND_NAME ?? 'CheapestGo'},
            -- Duplicates booking_id for hotels, where the two are the same string. Stored
            -- anyway so all three booking tables answer "which platform" from one column
            -- name — flights and unified rows have no equivalent of booking_id.
            booking_reference = ${bookingId},
            usd_amount = ${fx.usd_amount}, fx_rate = ${fx.fx_rate},
            fx_captured_at = ${fx.fx_captured_at}, fx_source = ${fx.fx_source}
        WHERE booking_id = ${bookingId}
      `;
    } catch {
      // Columns don't exist on this DB yet — booking already saved, non-fatal.
    }

    // Insert policy snapshot
    const snapshotRows = await sql`
      INSERT INTO booking_policy_snapshots (
        booking_id, policy_type, summary, refundable_tag, hotel_remarks,
        no_show_penalty, early_departure_fee, free_cancel_deadline,
        raw_liteapi_response, captured_at
      ) VALUES (
        ${bookingId},
        ${policyType}::booking_policy_type,
        ${isRefundable ? 'Refundable rate' : 'Non-refundable rate'},
        ${isRefundable ? 'RFN' : 'NRFN'},
        '{}',
        0, 0,
        ${freeCancelDeadline ? sql`${freeCancelDeadline}::timestamptz` : sql`NULL`},
        ${JSON.stringify(booking)}::jsonb,
        NOW()
      )
      RETURNING id
    `;
    const snapshotId = snapshotRows[0]?.id ?? null;

    if (snapshotId) {
      await sql`UPDATE bookings SET policy_snapshot_id = ${snapshotId} WHERE booking_id = ${bookingId}`;

      for (let i = 0; i < cancelPenalties.length; i++) {
        const p = cancelPenalties[i];
        await sql`
          INSERT INTO policy_tiers (snapshot_id, cancel_deadline, penalty_amount, penalty_type, currency, tier_order)
          VALUES (
            ${snapshotId},
            ${p.deadline ? sql`${p.deadline}::timestamptz` : sql`NULL`},
            ${p.value ?? 0},
            ${p.penaltyType || 'fixed'},
            ${p.currency || currency},
            ${i}
          )
        `;
      }
    }

    if (params.paymentIntentId) {
      try {
        await stripe.paymentIntents.update(params.paymentIntentId, {
          metadata: { bookingId },
        });
      } catch (e: any) {
        console.warn('[confirmAndSaveTgxBooking] PI metadata update failed (non-critical):', e.message);
      }
    }

    return {
      success: true,
      data: {
        bookingId, status: bookingStatus, policyType, policySummary: isRefundable ? 'Refundable rate' : 'Non-refundable rate', totalPrice, currency,
        dbId,
        propertyAddress: hotelContent?.address ?? undefined,
        propertyCity: hotelContent?.city ?? undefined,
        propertyCountry: hotelContent?.country ?? undefined,
        starRating: hotelContent?.star_rating ?? undefined,
        reviewRating: hotelContent?.review_rating ?? undefined,
        reviewCount: hotelContent?.review_count ?? undefined,
        checkInTime: hotelContent?.check_in_time ?? undefined,
        checkOutTime: hotelContent?.check_out_time ?? undefined,
      },
    };
  } catch (error) {
    console.error('[confirmAndSaveTgxBooking] DB error after TGX confirmed — attempting emergency INSERT:', error);
    // Last-resort: minimal direct INSERT so the booking is at least traceable
    try {
      const sqlEmergency = getSqlAdmin();
      const emergencyNote = [params.specialRequests, '[EMERGENCY_RECOVERY — exception during save]'].filter(Boolean).join(' | ');
      const emergencyRows = await sqlEmergency`
        INSERT INTO bookings (
          booking_id, user_id, property_name, property_image, room_name,
          check_in, check_out, guests_adults, guests_children,
          total_price, currency,
          holder_first_name, holder_last_name, holder_email,
          status, special_requests, voucher_code, discount_amount,
          policy_type, cancellation_policy,
          provider, provider_metadata, payment_intent_id,
          supplier_cost, charged_price
        ) VALUES (
          ${bookingId}, ${user.id}, ${params.propertyName}, ${params.propertyImage ?? null}, ${params.roomName},
          ${checkIn}::date, ${checkOut}::date,
          ${params.adults}, ${params.children ?? 0},
          ${totalPrice}, ${storedCurrency},
          ${params.holder.firstName}, ${params.holder.lastName}, ${params.holder.email},
          ${bookingStatus}, ${emergencyNote}, ${params.voucherCode ?? null}, ${params.discountAmount ?? 0},
          ${policyType}, ${storedCancelPolicy ? JSON.stringify(storedCancelPolicy) : null}::jsonb,
          'travelgatex', ${JSON.stringify({ supplierRef, hotelRef, hotelCode, clientReference })}::jsonb,
          ${params.paymentIntentId ?? null},
          ${price}, ${totalPrice}
        )
        RETURNING id
      `;
      console.warn('[confirmAndSaveTgxBooking] Emergency INSERT succeeded for', bookingId);
      return {
        success: true,
        data: {
          bookingId, status: bookingStatus, policyType, policySummary: isRefundable ? 'Refundable' : 'Non-refundable', totalPrice, currency: storedCurrency,
          dbId: emergencyRows[0]?.id,
          propertyAddress: hotelContent?.address ?? undefined,
          propertyCity: hotelContent?.city ?? undefined,
          propertyCountry: hotelContent?.country ?? undefined,
          starRating: hotelContent?.star_rating ?? undefined,
          reviewRating: hotelContent?.review_rating ?? undefined,
          reviewCount: hotelContent?.review_count ?? undefined,
          checkInTime: hotelContent?.check_in_time ?? undefined,
          checkOutTime: hotelContent?.check_out_time ?? undefined,
        },
      };
    } catch (emergencyErr) {
      console.error('CRITICAL: Emergency INSERT also failed for', bookingId, ':', emergencyErr);
    }
    return {
      success: false,
      providerConfirmed: true,
      data: { bookingId, status: bookingStatus, policyType, policySummary: isRefundable ? 'Refundable' : 'Non-refundable', totalPrice, currency: storedCurrency },
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
          console.log('[cancelBooking] TGX cancellation result:', result);
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
          const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['payment_method'] });
          const piAmount = pi.amount;
          const piCurrency = pi.currency.toLowerCase();
          const pm = pi.payment_method;
          const cardBrand = typeof pm === 'object' && pm?.card ? pm.card.brand.charAt(0).toUpperCase() + pm.card.brand.slice(1) : undefined;
          const cardLast4 = typeof pm === 'object' && pm?.card ? pm.card.last4 : undefined;
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
            .select('id, holder_email, holder_first_name, holder_last_name, property_name, property_image, room_name, check_in, check_out')
            .eq('booking_id', bookingId)
            .single()
            .then(({ data: b }) => {
              if (!b?.holder_email) return;
              sendHotelRefundEmail({
                bookingId,
                dbId: b.id,
                email: b.holder_email,
                guestName: `${b.holder_first_name || ''} ${b.holder_last_name || ''}`.trim(),
                hotelName: b.property_name || '',
                propertyImage: b.property_image ?? undefined,
                roomName: b.room_name || '',
                checkIn: b.check_in || '',
                checkOut: b.check_out || '',
                refundAmount: calculation.refundAmount,
                penaltyAmount: calculation.penaltyAmount,
                currency: calculation.currency,
                stripeRefundId,
                cardBrand,
                cardLast4,
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
            penaltyAmount: calculation.penaltyAmount,
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

    // Snapshot pre-amendment values so the confirmation email can show a before/after diff,
    // and grab the DB id + stay details so the email can link to /trips/{id} without a second round-trip.
    const { data: before } = await supabase
      .from('bookings')
      .select('id, holder_first_name, holder_last_name, holder_email, special_requests, property_image, room_name, check_in, check_out, guests_adults, guests_children')
      .eq('booking_id', validation.data.bookingId)
      .single();

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

    return {
      success: true,
      data: {
        bookingId: validation.data.bookingId,
        status: 'confirmed',
        dbId: before?.id,
        propertyImage: before?.property_image ?? undefined,
        roomName: before?.room_name ?? undefined,
        checkIn: before?.check_in ?? undefined,
        checkOut: before?.check_out ?? undefined,
        adults: before?.guests_adults ?? undefined,
        children: before?.guests_children ?? undefined,
        previous: before ? {
          firstName: before.holder_first_name || '',
          lastName: before.holder_last_name || '',
          email: before.holder_email || '',
          remarks: before.special_requests ?? null,
        } : undefined,
      },
    };
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
