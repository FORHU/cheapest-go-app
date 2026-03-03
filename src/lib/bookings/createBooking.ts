import { createClient } from '@supabase/supabase-js';

// ─── Types ───────────────────────────────────────────────────────────

export type BookingType = 'flight' | 'hotel';

export type BookingStatus =
    | 'pending'
    | 'confirmed'
    | 'ticketed'
    | 'cancelled'
    | 'refunded'
    | 'failed'
    | 'expired';

/** Row shape matching the unified_bookings table */
export interface UnifiedBooking {
    id: string;
    user_id: string;
    type: BookingType;
    provider: string;
    external_id: string | null;
    status: BookingStatus;
    total_price: number;
    currency: string;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}

// ─── Flight Metadata ─────────────────────────────────────────────────

export interface FlightBookingMetadata {
    [key: string]: unknown;
    /** Offer ID from the provider */
    offerId: string;
    /** PNR / confirmation code */
    pnr?: string;
    /** Ticket numbers (one per passenger) */
    ticketNumbers?: string[];
    /** Route summary */
    route: {
        origin: string;
        destination: string;
        departureDate: string;
        returnDate?: string;
    };
    /** Passenger list */
    passengers: {
        firstName: string;
        lastName: string;
        type: 'adult' | 'child' | 'infant';
        email?: string;
    }[];
    /** Cabin class */
    cabinClass: string;
    /** Number of stops */
    totalStops: number;
    /** Airlines involved */
    airlines: string[];
    /** Price breakdown */
    priceBreakdown?: {
        base: number;
        taxes: number;
        fees: number;
    };
    /** Raw provider response for audit */
    _raw?: unknown;
}

// ─── Hotel Metadata ──────────────────────────────────────────────────

export interface HotelBookingMetadata {
    [key: string]: unknown;
    /** LiteAPI booking ID */
    liteApiBookingId?: string;
    /** Property details */
    property: {
        name: string;
        image?: string;
        location?: string;
    };
    /** Room details */
    room: {
        name: string;
        boardType?: string;
    };
    /** Stay dates */
    checkIn: string;
    checkOut: string;
    /** Guest counts */
    guests: {
        adults: number;
        children: number;
    };
    /** Guest info */
    holder: {
        firstName: string;
        lastName: string;
        email: string;
    };
    /** Special requests */
    specialRequests?: string;
    /** Cancellation policy snapshot */
    cancellationPolicy?: unknown;
    /** Raw provider response for audit */
    _raw?: unknown;
}

// ─── Input Types ─────────────────────────────────────────────────────

export interface CreateFlightBookingInput {
    type: 'flight';
    userId: string;
    provider: string;
    externalId?: string;
    status?: BookingStatus;
    totalPrice: number;
    currency: string;
    metadata: FlightBookingMetadata;
}

export interface CreateHotelBookingInput {
    type: 'hotel';
    userId: string;
    provider: string;
    externalId?: string;
    status?: BookingStatus;
    totalPrice: number;
    currency: string;
    metadata: HotelBookingMetadata;
}

export type CreateBookingInput = CreateFlightBookingInput | CreateHotelBookingInput;

// ─── Result ──────────────────────────────────────────────────────────

export interface CreateBookingResult {
    success: boolean;
    data?: UnifiedBooking;
    error?: string;
}

// ─── Supabase Service Client ─────────────────────────────────────────

function getServiceClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error('Missing Supabase service credentials');
    }
    return createClient(url, key);
}

// ─── Create Booking ──────────────────────────────────────────────────

/**
 * Insert a new unified booking record (flight or hotel).
 *
 * @param input - Booking data with typed metadata for flight or hotel.
 * @returns The inserted booking row, or an error.
 *
 * @example
 * ```ts
 * const result = await createBooking({
 *   type: 'flight',
 *   userId: user.id,
 *   provider: 'duffel',
 *   externalId: 'ABC123',
 *   totalPrice: 450,
 *   currency: 'USD',
 *   metadata: {
 *     offerId: 'duffel_1234',
 *     route: { origin: 'MNL', destination: 'ICN', departureDate: '2026-03-15' },
 *     passengers: [{ firstName: 'John', lastName: 'Doe', type: 'adult' }],
 *     cabinClass: 'economy',
 *     totalStops: 0,
 *     airlines: ['KE'],
 *   },
 * });
 * ```
 */
export async function createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
    // ── Validate ─────────────────────────────────────────────────
    if (!input.userId) {
        return { success: false, error: 'userId is required' };
    }
    if (!input.provider) {
        return { success: false, error: 'provider is required' };
    }
    if (input.totalPrice == null || input.totalPrice < 0) {
        return { success: false, error: 'totalPrice must be a non-negative number' };
    }
    if (!input.currency || input.currency.length !== 3) {
        return { success: false, error: 'currency must be a 3-letter code' };
    }

    try {
        const supabase = getServiceClient();

        const row = {
            user_id: input.userId,
            type: input.type,
            provider: input.provider,
            external_id: input.externalId ?? null,
            status: input.status ?? 'confirmed',
            total_price: input.totalPrice,
            currency: input.currency.toUpperCase(),
            metadata: input.metadata,
        };

        const { data, error } = await supabase
            .from('unified_bookings')
            .insert(row)
            .select()
            .single();

        if (error) {
            console.error('[createBooking] Supabase error:', error);
            return { success: false, error: error.message };
        }

        return { success: true, data: data as UnifiedBooking };
    } catch (err) {
        console.error('[createBooking] Error:', err);
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to create booking',
        };
    }
}

// ─── Get Booking by ID ───────────────────────────────────────────────

export async function getUnifiedBooking(
    bookingId: string,
    userId: string,
): Promise<CreateBookingResult> {
    try {
        const supabase = getServiceClient();

        const { data, error } = await supabase
            .from('unified_bookings')
            .select()
            .eq('id', bookingId)
            .eq('user_id', userId)
            .single();

        if (error || !data) {
            return { success: false, error: error?.message ?? 'Booking not found' };
        }

        return { success: true, data: data as UnifiedBooking };
    } catch (err) {
        console.error('[getUnifiedBooking] Error:', err);
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to fetch booking',
        };
    }
}

// ─── Update Booking Status ───────────────────────────────────────────

export async function updateBookingStatus(
    bookingId: string,
    userId: string,
    status: BookingStatus,
    patchMetadata?: Record<string, unknown>,
): Promise<CreateBookingResult> {
    try {
        const supabase = getServiceClient();

        // Build update payload
        const updates: Record<string, unknown> = { status };

        // Optionally merge new keys into metadata
        if (patchMetadata && Object.keys(patchMetadata).length > 0) {
            // Use Postgres jsonb || operator via raw SQL or fetch-then-update
            const { data: existing } = await supabase
                .from('unified_bookings')
                .select('metadata')
                .eq('id', bookingId)
                .eq('user_id', userId)
                .single();

            if (existing) {
                updates.metadata = { ...(existing.metadata as object), ...patchMetadata };
            }
        }

        const { data, error } = await supabase
            .from('unified_bookings')
            .update(updates)
            .eq('id', bookingId)
            .eq('user_id', userId)
            .select()
            .single();

        if (error || !data) {
            return { success: false, error: error?.message ?? 'Update failed' };
        }

        return { success: true, data: data as UnifiedBooking };
    } catch (err) {
        console.error('[updateBookingStatus] Error:', err);
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to update booking',
        };
    }
}

// ─── List User Bookings ──────────────────────────────────────────────

export async function listUserBookings(
    userId: string,
    filter?: { type?: BookingType; status?: BookingStatus },
): Promise<{ success: boolean; data?: UnifiedBooking[]; error?: string }> {
    try {
        const supabase = getServiceClient();

        let query = supabase
            .from('unified_bookings')
            .select()
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (filter?.type) query = query.eq('type', filter.type);
        if (filter?.status) query = query.eq('status', filter.status);

        const { data, error } = await query;

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true, data: (data || []) as UnifiedBooking[] };
    } catch (err) {
        console.error('[listUserBookings] Error:', err);
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to list bookings',
        };
    }
}
