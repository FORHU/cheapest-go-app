import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { flightBookingSchema, FlightPassengerForm, FlightContactForm } from '@/lib/schemas/flight';
import type { FlightOffer } from '@/types/flights';
import type { SelectedSeat } from '@/types/seatMap';
import type { SelectedBag } from '@/types/bags';
import { createClient } from '@/utils/supabase/client';

export type BookingStep = 'form' | 'submitting' | 'payment' | 'success' | 'error';

export interface PriceChangedData {
    oldPrice: number;
    newPrice: number;
    currency: string;
}

export function useFlightBooking() {
    const router = useRouter();
    const [offer, setOffer] = useState<FlightOffer | null>(null);
    const [offerExpiresAt, setOfferExpiresAt] = useState<Date | null>(null);
    const [step, setStep] = useState<BookingStep>('form');
    const [errorMsg, setErrorMsg] = useState('');
    const [priceChangedData, setPriceChangedData] = useState<PriceChangedData | null>(null);
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
                        type, firstName: '', lastName: '', gender: '', birthDate: '',
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
            type: 'ADT', firstName: '', lastName: '', gender: '', birthDate: '',
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
            router.replace('/');
            return;
        }

        let parsedOffer: FlightOffer;
        try {
            parsedOffer = JSON.parse(raw);
        } catch {
            router.replace('/');
            return;
        }

        // Duffel offers have a hard expiry — check it before allowing the user to proceed.
        // If the offer is already expired (e.g. user returns to the page hours later),
        // show an error immediately instead of letting them fill the form and fail at payment.
        const rawOffer = (parsedOffer as any)._rawOffer || (parsedOffer as any).rawOffer;
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
            const { data: { user } } = await createClient().auth.getUser();

            try {
                const { data, error } = await createClient().functions.invoke('revalidate-flight', {
                    body: {
                        provider: parsedOffer.provider,
                        userId: user?.id || 'anonymous',
                        flightPayload: {
                            oldPrice: parsedOffer.price.total,
                            currency: parsedOffer.price.currency,
                            traceId: parsedOffer.provider.startsWith('mystifly') ? ((parsedOffer as any).traceId ?? parsedOffer.offerId) : undefined,
                            flight: parsedOffer.provider === 'duffel'
                                ? ((parsedOffer as any)._rawOffer || (parsedOffer as any).rawOffer || parsedOffer)
                                : undefined,
                        }
                    }
                });

                if (error) throw error;
                if (!data.success) throw new Error(data.error || 'Revalidation failed');
                if (!data.seatsAvailable) {
                    // SearchIdentifier errors mean the revalidation API can't run — not that
                    // the flight is unavailable. Soft-pass and let the booking API validate.
                    const isSearchIdError = /searchIdentifier.*empty|cannot revalidate/i.test(data.error || '');
                    if (!isSearchIdError) {
                        throw new Error(data.error || 'Flight is no longer available. Please search again.');
                    }
                    console.warn('[useFlightBooking] SearchIdentifier revalidation error — soft-passing, proceeding with original offer');
                }

                const revalidatedOffer = {
                    ...parsedOffer,
                    price: {
                        ...parsedOffer.price,
                        total: data.newPrice || parsedOffer.price.total,
                    },
                    farePolicy: data.farePolicy,
                    policyChanged: data.priceChanged || (JSON.stringify(parsedOffer.farePolicy) !== JSON.stringify(data.farePolicy)),
                    seatsRemaining: data.seatsRemaining ?? parsedOffer.seatsRemaining,
                };

                if (isMounted) {
                    sessionStorage.setItem('selectedFlight', JSON.stringify(revalidatedOffer));
                    setOffer(revalidatedOffer);
                    // Re-extract expiry from the revalidated offer's raw offer
                    const rRaw = (revalidatedOffer as any)._rawOffer || (revalidatedOffer as any).rawOffer;
                    const rExpiry = rRaw?.expires_at ?? (revalidatedOffer as any).expires_at ?? revalidatedOffer.lastTicketDate;
                    if (rExpiry) setOfferExpiresAt(new Date(rExpiry));
                }
            } catch (err) {
                console.error('[useFlightBooking] Revalidation failed:', err);
                if (isMounted) {
                    setErrorMsg('This flight is no longer available or its fare rules have expired. Please search again.');
                    setStep('error');
                    setOffer(parsedOffer); // Set old offer just so the error UI renders
                }
            }
        };

        revalidate();

        return () => { isMounted = false; };
    }, [router]);

    const updatePassenger = (idx: number, field: keyof FlightPassengerForm, value: string) => {
        setPassengers(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
    };

    const addPassenger = () => {
        setPassengers(prev => [...prev, {
            type: 'ADT', firstName: '', lastName: '', gender: '', birthDate: '',
            nationality: 'KR', passport: '', passportExpiry: '',
        }]);
    };

    const removePassenger = (idx: number) => {
        if (passengers.length <= 1) return;
        setPassengers(prev => prev.filter((_, i) => i !== idx));
    };

    const bookMutation = useMutation({
        mutationFn: async ({ offer, passengers, contact, seats, bags }: { offer: FlightOffer, passengers: FlightPassengerForm[], contact: FlightContactForm, seats: SelectedSeat[], bags: SelectedBag[] }) => {
            // Client-side auth check (fast-fail UX; server re-verifies via JWT)
            const { data: { user } } = await createClient().auth.getUser();

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
                    itineraryIndex: (seg as any).itineraryIndex,
                })),
                // CRITICAL FIX: Only Duffel require the raw offer to complete booking
                ...(offer.provider === 'duffel' ? {
                    _rawOffer: (offer as any)._rawOffer || (offer as any).rawOffer || offer,
                } : {}),
            };

            // CRITICAL-3 FIX: Don't send userId — server extracts it from JWT
            const res = await fetch('/api/flights/book', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
                }),
            });

            const data = await res.json();
            if (!data.success) {
                if (data.error === 'price_changed') {
                    // Encode as a structured error so onError can extract the prices
                    const err = new Error('price_changed') as any;
                    err.priceChangedData = { oldPrice: data.oldPrice, newPrice: data.newPrice, currency: data.currency };
                    throw err;
                }
                throw new Error(data.error || 'Booking failed');
            }

            return data.data ?? data;
        },
        onMutate: () => {
            setStep('submitting');
            setErrorMsg('');
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
                setErrorMsg("You need to sign in to complete your booking.");
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
            } else {
                setErrorMsg(error.message || 'Booking failed. Please try again.');
                setStep('error');
                idempotencyKeyRef.current = generateId();
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
            setStep('success');
            return;
        }

        setStep('submitting');

        if (typeof window !== 'undefined') {
            sessionStorage.removeItem('flightPassengers');
            sessionStorage.removeItem('flightContact');
            sessionStorage.removeItem('flightSearchPassengers');
            sessionStorage.removeItem('selectedFlight');
            sessionStorage.removeItem('flightBookingSessionId');
            sessionStorage.removeItem('flightPaymentIntentId');
            sessionStorage.removeItem('flightBookingTs');
        }

        let resolved = false;

        // ── Confirm fallback (starts after 3s delay) ──────────────────
        // Runs in parallel with DB polling. create-booking is idempotent so
        // it's safe even if the webhook also fires.
        const confirmPromise = new Promise<{ type: 'confirm'; data: any; ok: boolean }>(resolve => {
            setTimeout(async () => {
                if (resolved) return;
                try {
                    const res = await fetch('/api/flights/confirm', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
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
                    if (statusData.found) {
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

        // ── Race: whichever resolves first wins ───────────────────────
        const winner = await Promise.race([pollPromise, confirmPromise]);
        resolved = true;

        if (winner.type === 'poll') {
            const d = winner.data;
            if (d.failed) {
                setErrorMsg(d.error || 'Booking failed. Your payment has been automatically refunded.');
                setStep('error');
                return;
            }
            if (d.pnr) setBookingResult(prev => ({ ...prev, bookingId: d.bookingId, pnr: d.pnr }));
            setStep('success');
            return;
        }

        // confirm won
        const { data, ok } = winner;
        if (!data || !ok || data.success === false) {
            const errMsg = data?.error || 'Booking could not be completed. Your card has not been charged.';
            setErrorMsg(errMsg);
            setStep('error');
            if (typeof window !== 'undefined') {
                sessionStorage.removeItem('flightBookingSessionId');
                sessionStorage.removeItem('flightPaymentIntentId');
                sessionStorage.removeItem('flightBookingTs');
            }
            return;
        }
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
            const rawOffer = (offer as any)._rawOffer || (offer as any).rawOffer;
            if (!rawOffer?.id) {
                setErrorMsg('Flight offer data missing. Please go back and select the flight again.');
                setStep('error');
                return;
            }
        }

        try {
            flightBookingSchema.parse({ passengers, contact });
            bookMutation.mutate({ offer, passengers, contact, seats: selectedSeats, bags: selectedBags });
        } catch (error) {
            if (error instanceof z.ZodError) {
                setErrorMsg(error.issues[0].message);
            } else if (error instanceof Error) {
                setErrorMsg(error.message);
            }
        }
    };

    return {
        offer,
        offerExpiresAt,
        step,
        setStep,
        errorMsg,
        priceChangedData,
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
