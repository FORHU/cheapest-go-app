import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { flightBookingSchema, flightPassengerSchema, flightContactSchema, FlightPassengerForm, FlightContactForm } from '@/lib/schemas/flight';
import type { FlightOffer } from '@/types/flights';
import type { SelectedSeat } from '@/types/seatMap';
import type { SelectedBag } from '@/types/bags';
import { useUser } from '@/stores/authStore';
import { useUserCurrency } from '@/stores/searchStore';
import { clientFetch } from '@/lib/api/client';

export type BookingStep = 'form' | 'submitting' | 'payment' | 'success' | 'error';

/**
 * Failures that provably created nothing at the supplier, and are therefore the
 * only ones safe to retry under a NEW idempotency key.
 *
 * The rule is stated the other way round on purpose. A timeout or a 5xx tells us
 * the request did not come back — not that it did not happen. Duffel completes
 * the airline booking whether or not we are still listening, so a retry has to
 * be recognisable to Duffel as the same booking rather than a new one.
 *
 * This used to be an allow-list of ambiguous codes instead, and it did not hold.
 * It listed `timeout`, which nothing ever emits — the server maps supplier
 * timeouts to `supplier_outage` — while the code a platform-level timeout
 * actually produces, `booking_timeout` (see parseJsonResponse), was absent. So
 * were `server_error` and every raw network failure. Each of those re-keyed and
 * presented Duffel with what looked like a brand-new booking. That is how one
 * failed CRK→NRT attempt became two paid EVA tickets 61 seconds apart.
 *
 * Anything not named here keeps its key. Unknown codes are treated as ambiguous
 * because that is the direction whose worst case is a rejected retry rather than
 * a second live ticket.
 */
export const DEFINITIVE_FAILURE_CODES = new Set([
    // Rejected before any order was attempted — validation and guards.
    'unauthenticated',
    'duplicate_booking',
    'passenger_type_mismatch',
    'phone_number_invalid',
    'validation_error',
    // The supplier answered, and its answer was "no order was created".
    'price_changed',
    'offer_replaced',
    'flight_unavailable',
    'offer_expired',
    'seats_unavailable',
    'balance_insufficient',
    'FX_UNAVAILABLE',
]);

/** Should a retry present a fresh idempotency key? Only when nothing was created. */
export function shouldRegenerateIdempotencyKey(code: string): boolean {
    return DEFINITIVE_FAILURE_CODES.has(code);
}

/**
 * Scroll to and focus the first field that failed validation.
 *
 * Fields are located by `data-field="<zod path>"` — the same dotted path the schema
 * reports (`passengers.0.birthDate`, `contact.email`), so the form and the schema
 * cannot drift apart the way an ad-hoc mapping would.
 *
 * Returns false when no key matches an element on screen, which happens for
 * form-level issues such as "at least one adult passenger is required". The caller
 * falls back to the banner for those, otherwise they would be invisible.
 */
function focusFirstInvalidField(keys: string[]): boolean {
    if (typeof document === 'undefined') return false;
    for (const key of keys) {
        const el = document.querySelector<HTMLElement>(`[data-field="${CSS.escape(key)}"]`);
        if (!el) continue;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // preventScroll: the smooth scroll above owns the movement — letting focus
        // scroll too makes the view jump past the field and then snap back.
        el.focus?.({ preventScroll: true });
        return true;
    }
    return false;
}

/**
 * Parse a JSON API response without assuming the body is JSON.
 *
 * /api/flights/book does not always answer with JSON: an unhandled throw makes
 * Next.js render an HTML error page, and a function timeout makes the platform
 * serve an HTML gateway page. Calling res.json() on those raises a SyntaxError
 * ("Unexpected token '<', \"<!DOCTYPE \"...") which then travels down the same
 * path as a real booking error and surfaces to the traveller as the failure
 * reason. Convert those into stable codes instead, and log the real body so the
 * underlying 5xx is still diagnosable.
 */
async function parseJsonResponse(res: Response, label: string): Promise<any> {
    const body = await res.text();
    try {
        return JSON.parse(body);
    } catch {
        console.error(
            `[useFlightBooking] ${label} returned non-JSON (HTTP ${res.status}):`,
            body.slice(0, 500),
        );
        throw new Error(res.status === 504 || res.status === 408 ? 'booking_timeout' : 'server_error');
    }
}

export interface PriceChangedData {
    oldPrice: number;
    newPrice: number;
    currency: string;
}

export function useFlightBooking() {
    const router = useRouter();
    const t = useTranslations('flightBook');
    const [offer, setOffer] = useState<FlightOffer | null>(null);
    const [offerExpiresAt, setOfferExpiresAt] = useState<Date | null>(null);
    const [step, setStep] = useState<BookingStep>('form');
    const [errorMsg, setErrorMsg] = useState('');
    // Keyed by the schema's own dotted path — `passengers.0.birthDate`, `contact.email`.
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [priceChangedData, setPriceChangedData] = useState<PriceChangedData | null>(null);
    const [duplicateBookingData, setDuplicateBookingData] = useState<{ existingBookingId: string; route: string; departureDate: string } | null>(null);
    const [bookingResult, setBookingResult] = useState<{
        bookingId?: string;
        pnr?: string;
        tickets?: { name: string; number: string }[];
    } | null>(null);
    const [clientSecret, setClientSecret] = useState('');

    // HIGH-2 FIX: Idempotency key to prevent double bookings
    // Helper to generate UUIDs safely on HTTP or HTTPS
    const generateId = (): string => {
        if (typeof crypto !== 'undefined') {
            if (crypto.randomUUID) {
                return crypto.randomUUID();
            }
            if (crypto.getRandomValues) {
                const bytes = new Uint8Array(16);
                crypto.getRandomValues(bytes);
                bytes[6] = (bytes[6] & 0x0f) | 0x40;
                bytes[8] = (bytes[8] & 0x3f) | 0x80;
                const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0'));
                return `${hex[0]}${hex[1]}${hex[2]}${hex[3]}-${hex[4]}${hex[5]}-${hex[6]}${hex[7]}-${hex[8]}${hex[9]}-${hex.slice(10).join('')}`;
            }
        }
        // Very last resort fallback matching uuid structure if all crypto fails
        let d = new Date().getTime();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = (d + Math.random() * 16) % 16 | 0;
            d = Math.floor(d / 16);
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    };

    const idempotencyKeyRef = useRef<string>(generateId());
    // Tracks the booking session ID after Stripe payment, for PNR confirmation
    const bookingSessionIdRef = useRef<string | null>(null);

    const [selectedSeats, setSelectedSeats] = useState<SelectedSeat[]>([]);
    const [selectedBags, setSelectedBags] = useState<SelectedBag[]>([]);

    const clearFieldError = useCallback((key: string) => {
        setFieldErrors(prev => {
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
    }, []);

    // Validate a single field on blur using the field's own sub-schema.
    // path follows Zod's dotted convention: 'passengers.0.firstName', 'contact.email'.
    const validateField = useCallback((path: string, value: string) => {
        const parts = path.split('.');
        let schema: z.ZodTypeAny | undefined;

        if (parts[0] === 'passengers' && parts.length === 3) {
            const field = parts[2] as keyof typeof flightPassengerSchema.shape;
            schema = flightPassengerSchema.shape[field];
        } else if (parts[0] === 'contact' && parts.length === 2) {
            const field = parts[1] as keyof typeof flightContactSchema.shape;
            schema = flightContactSchema.shape[field];
        }

        if (!schema) return;
        const result = schema.safeParse(value);
        if (!result.success) {
            const raw = result.error.issues[0]?.message ?? 'Invalid';
            const translated: Record<string, string> = {
                'Use English letters only (e.g. Jose instead of José)': t('validation.nameIcao'),
                'First name is required': t('validation.firstNameRequired'),
                'Last name is required': t('validation.lastNameRequired'),
                'Phone number is required': t('validation.phoneRequired'),
                'Phone number must contain digits only': t('validation.phoneDigitsOnly'),
            };
            setFieldErrors(prev => ({ ...prev, [path]: translated[raw] ?? raw }));
        }
    }, [t]);

    const [passengers, setPassengers] = useState<FlightPassengerForm[]>(() => {
        if (typeof window !== 'undefined') {
            const saved = sessionStorage.getItem('flightPassengers');
            if (saved) {
                try { return JSON.parse(saved); } catch (e) { console.error('Error parsing saved passengers:', e); }
            }

            // Initialize from search passenger counts so the form matches the searched itinerary
            const searchCounts = sessionStorage.getItem('flightSearchPassengers');
            if (searchCounts) {
                try {
                    const { adults = 1, children = 0, infants = 0 } = JSON.parse(searchCounts);
                    const blank = (type: 'ADT' | 'CHD' | 'INF'): FlightPassengerForm => ({
                        type, firstName: '', lastName: '', gender: 'M' as 'M' | 'F', birthDate: '',
                        nationality: 'KR', passport: '', passportExpiry: '',
                    });
                    const forms: FlightPassengerForm[] = [
                        ...Array.from({ length: adults }, () => blank('ADT')),
                        ...Array.from({ length: children }, () => blank('CHD')),
                        ...Array.from({ length: infants }, () => blank('INF')),
                    ];
                    if (forms.length > 0) return forms;
                } catch (e) { console.error('Error parsing search passengers:', e); }
            }
        }
        return [{
            type: 'ADT', firstName: '', lastName: '', gender: 'M' as 'M' | 'F', birthDate: '',
            nationality: 'KR', passport: '', passportExpiry: '',
        }];
    });

    const [contact, setContact] = useState<FlightContactForm>(() => {
        if (typeof window !== 'undefined') {
            const saved = sessionStorage.getItem('flightContact');
            if (saved) {
                try { return JSON.parse(saved); } catch (e) { console.error('Error parsing saved contact:', e); }
            }
        }
        return {
            email: '', phone: '', countryCode: '82',
            addressLine: '', city: '', postalCode: '', country: 'KR',
        };
    });

    const user = useUser();
    const userCurrency = useUserCurrency();

    // Autofill from profile when user logs in
    useEffect(() => {
        if (!user) return;

        // Autofill Passenger 1 if blank
        setPassengers(prev => {
            if (prev.length > 0 && !prev[0].firstName && !prev[0].lastName) {
                const next = [...prev];
                next[0] = {
                    ...next[0],
                    firstName: user.firstName || '',
                    lastName: user.lastName || '',
                };
                return next;
            }
            return prev;
        });

        // Autofill Contact if blank
        setContact(prev => {
            if (!prev.email) {
                return {
                    ...prev,
                    email: user.email || '',
                };
            }
            return prev;
        });
    }, [user]);

    // Effect to persist passengers and contact to sessionStorage
    useEffect(() => {
        if (typeof window !== 'undefined') {
            sessionStorage.setItem('flightPassengers', JSON.stringify(passengers));
            sessionStorage.setItem('flightContact', JSON.stringify(contact));
        }
    }, [passengers, contact]);

    // Recovery: if the user hard-refreshed during the Stripe payment step,
    // selectedFlight is gone but flightBookingSessionId + flightPaymentIntentId remain.
    // Auto-confirm so the booking isn't left in limbo.
    // Only recover if the payment was initiated within the last 30 minutes — prevents
    // stale keys from a previous failed/expired booking from re-triggering confirm.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const recoverySessionId = sessionStorage.getItem('flightBookingSessionId');
        const recoveryPaymentIntentId = sessionStorage.getItem('flightPaymentIntentId');
        const ts = Number(sessionStorage.getItem('flightBookingTs') || '0');
        const ageMs = Date.now() - ts;
        const THIRTY_MIN = 30 * 60 * 1000;
        if (recoverySessionId && recoveryPaymentIntentId && ageMs < THIRTY_MIN) {
            console.log('[useFlightBooking] Detected payment-step refresh — auto-confirming booking');
            bookingSessionIdRef.current = recoverySessionId;
            pollForBooking(recoveryPaymentIntentId);
        } else if (recoverySessionId || recoveryPaymentIntentId) {
            // Stale keys — clear them so they don't interfere
            sessionStorage.removeItem('flightBookingSessionId');
            sessionStorage.removeItem('flightPaymentIntentId');
            sessionStorage.removeItem('flightBookingTs');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const raw = sessionStorage.getItem('selectedFlight');
        if (!raw) {
            // No offer to book — back to flight search rather than the landing
            // page, so the user is one step from re-picking, not at square one.
            router.replace('/flights/search');
            return;
        }

        let parsedOffer: FlightOffer;
        try {
            parsedOffer = JSON.parse(raw);
            if (!parsedOffer || !parsedOffer.price || !parsedOffer.price.total || !parsedOffer.segments) {
                // Failsafe for invalid cache structure (e.g. leftover unmapped raw objects)
                throw new Error("Invalid cached flight format");
            }
        } catch {
            sessionStorage.removeItem('selectedFlight');
            router.replace('/flights/search');
            return;
        }

        // Duffel offers have a hard expiry — check it before allowing the user to proceed.
        // If the offer is already expired (e.g. user returns to the page hours later),
        // show an error immediately instead of letting them fill the form and fail at payment.
        const rawOffer = (parsedOffer as any).raw || (parsedOffer as any)._rawOffer || (parsedOffer as any).rawOffer;
        const expiresAt = rawOffer?.expires_at ?? (parsedOffer as any).expires_at ?? parsedOffer.lastTicketDate;
        if (expiresAt) {
            const expiryDate = new Date(expiresAt);
            if (expiryDate < new Date()) {
                sessionStorage.removeItem('selectedFlight');
                setErrorMsg('This flight offer has expired. Please search again for current availability.');
                setStep('error');
                setOffer(parsedOffer);
                return;
            }
            setOfferExpiresAt(expiryDate);
        }

        if (parsedOffer.farePolicy?.policyVersion === 'revalidated') {
            setOffer(parsedOffer);
            return;
        }

        // Auto-revalidate the flight
        let isMounted = true;
        const revalidate = async () => {
            try {
                // Use a relative URL so this always hits the current origin regardless of
                // NEXT_PUBLIC_SITE_URL or whether Docker is running on a different port.
                const res = await fetch('/api/fn/revalidate-flight', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
                    body: JSON.stringify({
                        provider: parsedOffer.provider,
                        userId: user?.id || 'anonymous',
                        flightPayload: {
                            oldPrice: parsedOffer?.price?.total,
                            currency: parsedOffer?.price?.currency,
                            traceId: parsedOffer?.provider?.startsWith('mystifly') ? ((parsedOffer as any).traceId ?? parsedOffer.offerId) : undefined,
                            flight: parsedOffer?.provider === 'duffel'
                                ? ((parsedOffer as any).raw || (parsedOffer as any)._rawOffer || (parsedOffer as any).rawOffer || parsedOffer)
                                : undefined,
                        },
                    }),
                });

                // The revalidate route soft-passes all Duffel API errors and always returns
                // 200. A non-2xx here is an infrastructure problem (stale Docker image,
                // network), not a "flight unavailable" signal — fall through to soft-pass.
                if (!res.ok) {
                    console.warn('[useFlightBooking] Revalidation endpoint returned', res.status, '— soft-passing');
                    if (isMounted) setOffer(parsedOffer);
                    return;
                }

                const data = await res.json();

                if (!data.success || !data.seatsAvailable) {
                    const isSearchIdError = /searchIdentifier.*empty|cannot revalidate/i.test(data.error || '');
                    if (!data.seatsAvailable && !isSearchIdError) {
                        if (isMounted) {
                            setErrorMsg('This flight is no longer available. Please search again.');
                            setStep('error');
                            setOffer(parsedOffer);
                        }
                        return;
                    }
                    console.warn('[useFlightBooking] Revalidation soft-pass:', data.error);
                    if (isMounted) setOffer(parsedOffer);
                    return;
                }

                // When to move the number the traveller is looking at.
                //
                // Revalidation reports the live fare on every load, so adopting it
                // unconditionally repriced the page the instant it opened — including for
                // the sub-tolerance jitter the app has already decided is immaterial, which
                // is exactly the "price changed the moment I clicked" effect.
                //
                //   cheaper           → adopt, the traveller pays the lower fare
                //   material increase → adopt, they will be charged it, so hiding it is worse
                //                       (`policyChanged` below flags it in the fare panel)
                //   minor increase    → keep the searched price; we absorb the difference
                //                       rather than move the price under them
                const liveTotal: number | undefined =
                    typeof data.newPrice === 'number' && data.newPrice > 0 ? data.newPrice : undefined;
                const shouldAdoptLiveTotal =
                    liveTotal !== undefined && (liveTotal < parsedOffer.price.total || data.priceChanged);

                const revalidatedOffer = {
                    ...parsedOffer,
                    price: {
                        ...parsedOffer.price,
                        total: shouldAdoptLiveTotal ? liveTotal : parsedOffer.price.total,
                    },
                    farePolicy: data.farePolicy,
                    policyChanged: data.priceChanged || (JSON.stringify(parsedOffer.farePolicy) !== JSON.stringify(data.farePolicy)),
                    seatsRemaining: data.seatsRemaining ?? parsedOffer.seatsRemaining,
                };

                if (isMounted) {
                    sessionStorage.setItem('selectedFlight', JSON.stringify(revalidatedOffer));
                    setOffer(revalidatedOffer);
                    // Re-extract expiry from the revalidated offer's raw offer
                    const rRaw = (revalidatedOffer as any).raw || (revalidatedOffer as any)._rawOffer || (revalidatedOffer as any).rawOffer;
                    const rExpiry = rRaw?.expires_at ?? (revalidatedOffer as any).expires_at ?? revalidatedOffer.lastTicketDate;
                    if (rExpiry) setOfferExpiresAt(new Date(rExpiry));
                }
            } catch (err) {
                // Network-level failure (fetch threw entirely — CORS, connection refused, etc.).
                // The /api/flights/book route re-validates independently, so don't block the
                // user here — show the form and let booking surface real errors.
                console.warn('[useFlightBooking] Revalidation network error — soft-passing:', (err as any)?.message);
                if (isMounted) setOffer(parsedOffer);
            }
        };

        revalidate();

        return () => { isMounted = false; };
    }, [router]);

    const updatePassenger = (idx: number, field: keyof FlightPassengerForm, value: string) => {
        setPassengers(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
        // Editing a field clears its complaint — leaving a stale error under an input the
        // traveller has just corrected reads as though the fix did not register.
        clearFieldError(`passengers.${idx}.${field}`);
    };

    const addPassenger = () => {
        setPassengers(prev => [...prev, {
            type: 'ADT', firstName: '', lastName: '', gender: 'M' as 'M' | 'F', birthDate: '',
            nationality: 'KR', passport: '', passportExpiry: '',
        }]);
    };

    const removePassenger = (idx: number) => {
        if (passengers.length <= 1) return;
        setPassengers(prev => prev.filter((_, i) => i !== idx));
    };

    const bookMutation = useMutation({
        mutationFn: async ({ offer, passengers, contact, seats, bags }: { offer: FlightOffer, passengers: FlightPassengerForm[], contact: FlightContactForm, seats: SelectedSeat[], bags: SelectedBag[] }) => {
            const bundleHotelId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('bundleHotelId') : null;

            // Client-side auth check (fast-fail UX; server re-verifies via JWT)
            

            if (!user) {
                throw new Error("unauthenticated");
            }

            const seatServiceIds = seats.map(s => s.serviceId);
            const seatTotal = seats.reduce((sum, s) => sum + s.price, 0);
            const bagServiceIds = bags.map(b => b.serviceId);
            const bagTotal = bags.reduce((sum, b) => sum + b.price, 0);

            // CRITICAL-2 FIX: Do NOT send rawOffer/_raw — server rebuilds from normalized data
            const flightPayload = {
                traceId: (offer as any).traceId ?? offer.offerId,
                resultIndex: (offer as any).resultIndex ?? offer.offerId,
                price: offer.price.total,
                currency: offer.price.currency,
                tripType: offer.tripType ?? 'one-way',
                validatingAirline: offer.validatingAirline ?? offer.segments[0]?.airline.code,
                segments: offer.segments.map(seg => ({
                    airline: seg.airline.code,
                    airlineName: seg.airline.name,
                    flightNumber: seg.flightNumber,
                    origin: seg.departure.airport,
                    destination: seg.arrival.airport,
                    departureTime: seg.departure.time,
                    arrivalTime: seg.arrival.time,
                    cabinClass: seg.cabinClass,
                    bookingClass: (seg as any).bookingClass,
                    fareBasis: (seg as any).fareBasis,
                    // The normaliser names this `segmentIndex`; sending only the
                    // `itineraryIndex` alias meant undefined reached create-booking,
                    // which then stored every leg as segment_index 0 and lost the
                    // outbound/return ordering.
                    segmentIndex: (seg as any).segmentIndex,
                    itineraryIndex: (seg as any).itineraryIndex ?? (seg as any).segmentIndex,
                })),
                // CRITICAL FIX: Only Duffel require the raw offer to complete booking
                ...(offer.provider === 'duffel' ? {
                    _rawOffer: (offer as any).raw || (offer as any)._rawOffer || (offer as any).rawOffer || offer,
                } : {}),
            };

            // CRITICAL-3 FIX: Don't send userId — server extracts it from JWT
            const res = await clientFetch('/api/flights/book', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
                body: JSON.stringify({
                    provider: offer.provider,
                    flight: flightPayload,
                    passengers,
                    contact,
                    idempotencyKey: idempotencyKeyRef.current,
                    farePolicy: offer.farePolicy,
                    ...(seatServiceIds.length > 0 ? { seatServiceIds, seatTotal } : {}),
                    ...(bagServiceIds.length > 0 ? { bagServiceIds, bagTotal } : {}),
                    ...((offer as any)._confirmedPrice !== undefined ? { confirmedPrice: (offer as any)._confirmedPrice } : {}),
                    ...(bundleHotelId ? { bundleHotelId } : {}),
                    displayCurrency: userCurrency || 'USD',
                }),
            });

            const data = await parseJsonResponse(res, 'POST /api/flights/book');
            if (!data.success) {
                // Session rejected server-side. The `!user` guard above only catches the
                // case where the client already knows it is signed out; a cookie that the
                // client still trusts but the server no longer accepts — expired, revoked,
                // or issued by a different database — lands here instead. Route it to the
                // same 'unauthenticated' branch so it reopens the sign-in modal rather than
                // presenting an unrecoverable "Booking Failed" screen.
                if (res.status === 401 || data.errorCode === 'unauthenticated') {
                    throw new Error('unauthenticated');
                }
                // The duplicate guard answers with `code`, not `errorCode`, and carries
                // the clashing booking so the form can link straight to it.
                if (data.code === 'DUPLICATE_BOOKING') {
                    const err = new Error('duplicate_booking') as any;
                    err.duplicateBookingData = {
                        existingBookingId: data.existingBookingId,
                        route: data.route,
                        departureDate: data.departureDate,
                    };
                    throw err;
                }
                if (data.error === 'price_changed') {
                    const err = new Error('price_changed') as any;
                    err.priceChangedData = { oldPrice: data.oldPrice, newPrice: data.newPrice, currency: data.currency };
                    throw err;
                }
                if (data.error === 'offer_replaced') {
                    const err = new Error('offer_replaced') as any;
                    err.newOffer = data.newOffer;
                    throw err;
                }
                // Prefer a machine-readable code over `error`, which is often a full
                // sentence and would be mistaken for a code by the failure screen.
                throw new Error(data.errorCode || data.code || data.error || 'booking_failed');
            }

            return data.data ?? data;
        },
        onMutate: () => {
            setStep('submitting');
            setErrorMsg('');
            // Clear any panel from a previous attempt — the guard re-runs server-side
            // on every submit, so a stale warning would outlive the conflict.
            setDuplicateBookingData(null);
        },
        onSuccess: (data) => {
            // If Stripe PaymentIntent client_secret is returned, transition to embedded payment UI
            if (data.clientSecret) {
                setClientSecret(data.clientSecret);
                setStep('payment');
                // Store the session ID so we can poll for PNR after webhook processes
                bookingSessionIdRef.current = data.sessionId;
                setBookingResult({ bookingId: data.sessionId });
                // Remove selectedFlight and persist session ID so that if the user
                // hard-refreshes during the Stripe payment step we can recover the
                // in-flight booking rather than letting them re-submit the same offer.
                if (typeof window !== 'undefined') {
                    sessionStorage.removeItem('selectedFlight');
                    sessionStorage.setItem('flightBookingSessionId', data.sessionId);
                    sessionStorage.setItem('flightPaymentIntentId', data.paymentIntentId || '');
                    // Timestamp lets the recovery effect ignore stale data from prior failed attempts
                    sessionStorage.setItem('flightBookingTs', String(Date.now()));
                }
                return;
            }

            // Fallback (e.g. for free bookings or bypassed payments)
            setBookingResult({
                bookingId: data.bookingId,
                pnr: data.pnr,
                tickets: data.tickets,
            });
            setStep('success');

            // Clear session storage on success
            if (typeof window !== 'undefined') {
                sessionStorage.removeItem('flightPassengers');
                sessionStorage.removeItem('flightContact');
                sessionStorage.removeItem('flightSearchPassengers');
            }
            sessionStorage.removeItem('selectedFlight');
        },
        onError: (error: any) => {
            if (error.message === "unauthenticated") {
                setErrorMsg('CODE:unauthenticated');
                setStep('form');
                if (typeof window !== 'undefined') {
                    import('@/stores/authStore').then(({ useAuthStore }) => {
                        const redirectPath = window.location.pathname + window.location.search;
                        useAuthStore.getState().openAuthModal('email', redirectPath);
                    });
                }
            } else if (error.message === 'price_changed' && error.priceChangedData) {
                setPriceChangedData(error.priceChangedData);
                setStep('form');
                idempotencyKeyRef.current = generateId();
            } else if (error.message === 'duplicate_booking' && error.duplicateBookingData) {
                // Return to the form — that's where the duplicate panel renders, with a
                // link to the clashing booking. errorMsg stays empty so the generic red
                // banner doesn't double up on the dedicated panel.
                setDuplicateBookingData(error.duplicateBookingData);
                setErrorMsg('');
                setStep('form');
                idempotencyKeyRef.current = generateId();
            } else if (error.message === 'offer_replaced' && error.newOffer) {
                if (typeof window !== 'undefined') sessionStorage.setItem('selectedFlight', JSON.stringify(error.newOffer));
                setOffer(error.newOffer);
                const rRaw = (error.newOffer as any).raw || (error.newOffer as any)._rawOffer || (error.newOffer as any).rawOffer;
                const rExpiry = rRaw?.expires_at ?? error.newOffer.expires_at ?? error.newOffer.lastTicketDate;
                if (rExpiry) setOfferExpiresAt(new Date(rExpiry));
                setSelectedSeats([]);
                setSelectedBags([]);
                setErrorMsg('CODE:offer_replaced_seats_cleared');
                setStep('form');
                idempotencyKeyRef.current = generateId();
            } else {
                const code = error.message || 'booking_failed';
                // A dead offer can never succeed on a retry. Drop it so navigating back
                // to this page can't resurrect it from sessionStorage and fail again —
                // the failure screen already routes these to "Search Again".
                if ((code === 'flight_unavailable' || code === 'offer_expired') && typeof window !== 'undefined') {
                    sessionStorage.removeItem('selectedFlight');
                }
                setErrorMsg('CODE:' + code);
                setStep('error');

                // Only mint a fresh idempotency key when the failed attempt provably
                // created nothing at the supplier — see DEFINITIVE_FAILURE_CODES.
                // Anything else may have left a real order behind, and reusing the key
                // is the only thing standing between a retry and a second live ticket.
                if (shouldRegenerateIdempotencyKey(code)) {
                    idempotencyKeyRef.current = generateId();
                }
            }
        }
    });

    // ─── Confirm booking after Stripe payment succeeds ───────────────
    // Strategy: poll the DB every 2s AND kick off the confirm/create-booking call
    // after 3s in parallel. Whatever resolves first wins. This means:
    //   - Webhook fast path: booking appears in DB within ~5s → poll wins
    //   - No webhook (local dev) or slow webhook: confirm/create-booking wins at ~20-25s
    //     instead of waiting 15s before even starting it (was 35-45s total before)
    const pollForBooking = useCallback(async (paymentIntentId: string) => {
        const sessionId = bookingSessionIdRef.current;

        if (!sessionId || !paymentIntentId) {
            // Should not happen in normal flow — both are set before Stripe renders.
            // Showing success without confirmation would be a lie; surface an error instead.
            console.error('[pollForBooking] Missing sessionId or paymentIntentId — cannot confirm booking', { sessionId, paymentIntentId });
            setErrorMsg('Booking session data is missing. Please contact support with your payment reference.');
            setStep('error');
            return;
        }

        setStep('submitting');

        // Form state is finished with — the payment has been made, there is nothing
        // left to re-submit. Safe to drop now.
        if (typeof window !== 'undefined') {
            sessionStorage.removeItem('flightPassengers');
            sessionStorage.removeItem('flightContact');
            sessionStorage.removeItem('flightSearchPassengers');
            sessionStorage.removeItem('selectedFlight');
        }

        // The recovery keys are NOT dropped here. They are the only way back into a
        // booking that is mid-flight, and this function can run for 45 seconds — so
        // clearing them on entry meant a refresh anywhere in that window left a paid
        // booking with no route to its own confirmation. They are cleared once the
        // outcome is known instead, by clearRecovery() below.

        let resolved = false;

        // ── Confirm fallback (starts after 3s delay) ──────────────────
        // Runs in parallel with DB polling. create-booking is idempotent so
        // it's safe even if the webhook also fires.
        const confirmPromise = new Promise<{ type: 'confirm'; data: any; ok: boolean }>(resolve => {
            setTimeout(async () => {
                if (resolved) return;
                try {
                    const res = await clientFetch('/api/flights/confirm', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
                        body: JSON.stringify({ paymentIntentId, sessionId }),
                    });
                    const data = await res.json();
                    resolve({ type: 'confirm', data, ok: res.ok });
                } catch (e) {
                    console.error('[pollForBooking] confirm fetch error:', e);
                    resolve({ type: 'confirm', data: null, ok: false });
                }
            }, 3000);
        });

        // ── DB polling loop (every 2s, up to 45s total) ───────────────
        const pollPromise = new Promise<{ type: 'poll'; data: any }>(resolve => {
            const POLL_INTERVAL_MS = 2000;
            const POLL_TIMEOUT_MS = 45000;
            const pollStart = Date.now();

            const tick = async () => {
                if (resolved) return;
                try {
                    const statusRes = await fetch(`/api/flights/booking-status?sessionId=${encodeURIComponent(sessionId)}`);
                    const statusData = await statusRes.json();
                    // Only resolve when the booking is in a terminal state — not while
                    // it's still processing. A booking row without PNR or confirmed status
                    // means the airline hasn't responded yet; keep polling until it's final.
                    const isTerminal = statusData.failed || statusData.pnr || statusData.status === 'confirmed';
                    if (statusData.found && isTerminal) {
                        resolve({ type: 'poll', data: statusData });
                        return;
                    }
                } catch { /* network hiccup, keep polling */ }

                if (Date.now() - pollStart < POLL_TIMEOUT_MS) {
                    setTimeout(tick, POLL_INTERVAL_MS);
                }
                // Polling timed out — confirmPromise will resolve eventually
            };

            setTimeout(tick, POLL_INTERVAL_MS); // first poll after 2s
        });

        /**
         * Retire the recovery keys.
         *
         * Called only once the booking has reached an outcome that a refresh cannot
         * improve on. A still-pending booking deliberately keeps them, so reloading
         * the page picks the poll back up rather than abandoning it.
         */
        const clearRecovery = () => {
            if (typeof window === 'undefined') return;
            sessionStorage.removeItem('flightBookingSessionId');
            sessionStorage.removeItem('flightPaymentIntentId');
            sessionStorage.removeItem('flightBookingTs');
        };

        // ── Race: whichever resolves first wins ───────────────────────
        const winner = await Promise.race([pollPromise, confirmPromise]);
        resolved = true;

        if (winner.type === 'poll') {
            const d = winner.data;
            if (d.failed) {
                clearRecovery();
                setErrorMsg(d.errorCode ? 'CODE:' + d.errorCode : (d.error || 'CODE:booking_failed_refunded'));
                setStep('error');
                return;
            }
            clearRecovery();
            if (d.pnr) setBookingResult(prev => ({ ...prev, bookingId: d.bookingId, pnr: d.pnr }));
            setStep('success');
            return;
        }

        // confirm won
        const { data, ok } = winner;
        if (!data || !ok || data.success === false) {
            const errMsg = data?.errorCode ? 'CODE:' + data.errorCode : (data?.error || 'CODE:booking_card_not_charged');

            // `booking_pending` means the payment landed and the booking is still
            // completing elsewhere. Keep the recovery keys: reloading should resume
            // the poll, not strand a paid booking on a dead screen.
            const stillRunning = data?.errorCode === 'booking_pending' || data?.errorCode === 'pending';
            if (!stillRunning) clearRecovery();

            setErrorMsg(errMsg);
            setStep('error');
            return;
        }
        clearRecovery();
        if (data.pnr) {
            setBookingResult(prev => ({ ...prev, bookingId: data.bookingId, pnr: data.pnr, tickets: data.tickets }));
        }
        setStep('success');
    }, []);


    const confirmPriceChange = () => {
        if (!offer || !priceChangedData) return;
        setPriceChangedData(null);
        // Re-submit with the confirmed new price baked into the offer so the server skips the check
        const confirmedOffer = {
            ...offer,
            price: { ...offer.price, total: priceChangedData.newPrice },
            _confirmedPrice: priceChangedData.newPrice,
        } as FlightOffer;
        // Persist the acceptance. Without this the confirmed price lived only inside
        // this one mutate() call: the page kept displaying the old fare, and any later
        // submit (a retry, or "Try Again" from the failure screen) sent the stale price
        // and tripped the very same price-change check again — the confirm prompt would
        // reappear indefinitely instead of converging.
        setOffer(confirmedOffer);
        if (typeof window !== 'undefined') {
            sessionStorage.setItem('selectedFlight', JSON.stringify(confirmedOffer));
        }
        bookMutation.mutate({ offer: confirmedOffer, passengers, contact, seats: selectedSeats, bags: selectedBags });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!offer) return;

        // Validate passenger count matches the original search
        const searchCounts = typeof window !== 'undefined'
            ? sessionStorage.getItem('flightSearchPassengers')
            : null;
        if (searchCounts) {
            try {
                const { adults = 1, children = 0, infants = 0 } = JSON.parse(searchCounts);
                const expected = adults + children + infants;
                if (passengers.length !== expected) {
                    setErrorMsg(`This fare was searched for ${expected} passenger(s) but ${passengers.length} passenger form(s) are filled. Please match the passenger count to your search.`);
                    return;
                }
            } catch { /* ignore parse errors, let server validate */ }
        }

        // Duffel offer expiry: no client-side buffer needed — the server's auto-refresh
        // handles expired offers by creating a new offer_request. Only block if the
        // offer is already past its expiry AND no rawOffer is available to refresh with.
        if (offer.provider === 'duffel') {
            const rawOffer = (offer as any).raw || (offer as any)._rawOffer || (offer as any).rawOffer;
            if (!rawOffer?.id) {
                setErrorMsg('Flight offer data missing. Please go back and select the flight again.');
                setStep('error');
                return;
            }
        }

        // safeParse, not parse: every issue is needed, not just the one that threw.
        // Reporting only `issues[0].message` in a banner meant a traveller with three bad
        // fields fixed one, resubmitted, and met the next — and a message like
        // "Must be YYYY-MM-DD" never said WHICH date, or which passenger's.
        const parsed = flightBookingSchema.safeParse({ passengers, contact });

        if (!parsed.success) {
            const nextErrors: Record<string, string> = {};
            for (const issue of parsed.error.issues) {
                const key = issue.path.join('.');
                // First message per field — later ones are usually consequences of the first.
                if (key && !nextErrors[key]) nextErrors[key] = issue.message;
            }
            setFieldErrors(nextErrors);

            const shown = focusFirstInvalidField(Object.keys(nextErrors));
            // Keep the banner only for issues with no field to attach to.
            setErrorMsg(shown ? '' : (parsed.error.issues[0]?.message ?? ''));
            return;
        }

        setFieldErrors({});
        setErrorMsg('');
        bookMutation.mutate({ offer, passengers, contact, seats: selectedSeats, bags: selectedBags });
    };

    // Clear "expired" error when user starts reselecting
    useEffect(() => {
        if (errorMsg.toLowerCase().includes('expired') || errorMsg.toLowerCase().includes('cleared')) {
            setErrorMsg('');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedSeats, selectedBags]);

    return {
        offer,
        offerExpiresAt,
        step,
        setStep,
        errorMsg,
        setErrorMsg,
        fieldErrors,
        clearFieldError,
        validateField,
        priceChangedData,
        duplicateBookingData,
        dismissDuplicateWarning: () => setDuplicateBookingData(null),
        bookingResult,
        clientSecret,
        passengers,
        contact,
        updatePassenger,
        addPassenger,
        removePassenger,
        setContact,
        handleSubmit,
        confirmPriceChange,
        selectedSeats,
        setSelectedSeats,
        selectedBags,
        setSelectedBags,
        pollForBooking,
        router,
    };
}
