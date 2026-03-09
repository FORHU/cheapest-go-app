import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { flightBookingSchema, FlightPassengerForm, FlightContactForm } from '@/lib/schemas/flight';
import type { FlightOffer } from '@/lib/flights/types';
import { createClient } from '@/utils/supabase/client';

export type BookingStep = 'form' | 'submitting' | 'payment' | 'success' | 'error';

export function useFlightBooking() {
    const router = useRouter();
    const [offer, setOffer] = useState<FlightOffer | null>(null);
    const [step, setStep] = useState<BookingStep>('form');
    const [errorMsg, setErrorMsg] = useState('');
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

    const [passengers, setPassengers] = useState<FlightPassengerForm[]>(() => {
        if (typeof window !== 'undefined') {
            const saved = sessionStorage.getItem('flightPassengers');
            if (saved) {
                try { return JSON.parse(saved); } catch (e) { console.error('Error parsing saved passengers:', e); }
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

        if (parsedOffer.farePolicy?.policyVersion === 'revalidated') {
            setOffer(parsedOffer);
            return;
        }

        // Auto-revalidate the flight
        let isMounted = true;
        const revalidate = async () => {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();

            try {
                const { data, error } = await supabase.functions.invoke('revalidate-flight', {
                    body: {
                        provider: parsedOffer.provider,
                        userId: user?.id || 'anonymous',
                        flightPayload: {
                            oldPrice: parsedOffer.price.total,
                            currency: parsedOffer.price.currency,
                            traceId: parsedOffer.provider.startsWith('mystifly') ? parsedOffer.offerId : undefined,
                            flight: parsedOffer.provider === 'duffel'
                                ? ((parsedOffer as any)._rawOffer || (parsedOffer as any).rawOffer || parsedOffer)
                                : undefined,
                        }
                    }
                });

                if (error) throw error;
                if (!data.success) throw new Error(data.error || 'Revalidation failed');

                const revalidatedOffer = {
                    ...parsedOffer,
                    price: {
                        ...parsedOffer.price,
                        total: data.newPrice || parsedOffer.price.total,
                    },
                    farePolicy: data.farePolicy,
                    policyChanged: data.priceChanged || (JSON.stringify(parsedOffer.farePolicy) !== JSON.stringify(data.farePolicy)),
                };

                if (isMounted) {
                    sessionStorage.setItem('selectedFlight', JSON.stringify(revalidatedOffer));
                    setOffer(revalidatedOffer);
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
        mutationFn: async ({ offer, passengers, contact }: { offer: FlightOffer, passengers: FlightPassengerForm[], contact: FlightContactForm }) => {
            // Client-side auth check (fast-fail UX; server re-verifies via JWT)
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                throw new Error("unauthenticated");
            }

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
                }),
            });

            const data = await res.json();
            if (!data.success) {
                throw new Error(data.error || 'Booking failed');
            }

            return data.data;
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
            }
            sessionStorage.removeItem('selectedFlight');
        },
        onError: (error) => {
            if (error.message === "unauthenticated") {
                setErrorMsg("You need to sign in to complete your booking.");
                setStep('form'); // CRITICAL FIX: reset loading state
                if (typeof window !== 'undefined') {
                    // Import the store and open the modal
                    import('@/stores/authStore').then(({ useAuthStore }) => {
                        const redirectPath = window.location.pathname + window.location.search;
                        useAuthStore.getState().openAuthModal('email', redirectPath);
                    });
                }
            } else {
                setErrorMsg(error.message || 'Booking failed. Please try again.');
                setStep('error');
                // Keep the same idempotency key for the same offer retry
                if (error?.message === "unauthenticated") {
                    // do nothing to idempotency, they just need to log in
                } else {
                    // If it failed for other reasons, generate a new key for next attempt
                    idempotencyKeyRef.current = generateId();
                }
            }
        }
    });

    // ─── Confirm booking after Stripe payment succeeds ───────────────
    // Calls /api/flights/confirm which verifies the PaymentIntent server-side
    // and directly triggers create-booking. Works without stripe listen locally.
    const pollForBooking = useCallback(async (paymentIntentId: string) => {
        const sessionId = bookingSessionIdRef.current;

        if (!sessionId || !paymentIntentId) {
            setStep('success');
            return;
        }

        // Show a loading state while confirming
        setStep('submitting');

        // Clear session storage now that payment is done
        if (typeof window !== 'undefined') {
            sessionStorage.removeItem('flightPassengers');
            sessionStorage.removeItem('flightContact');
            sessionStorage.removeItem('selectedFlight');
        }

        try {
            const res = await fetch('/api/flights/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paymentIntentId, sessionId }),
            });

            const data = await res.json();

            // Provider-level failure (e.g. Mystifly "Pending Need", fare expired, etc.)
            // Payment was NOT captured in these cases — show error, not success.
            if (!res.ok || data.success === false) {
                const errMsg = data.error || 'Booking could not be completed. Your card has not been charged.';
                setErrorMsg(errMsg);
                setStep('error');
                return;
            }

            if (data.success && data.pnr) {
                setBookingResult(prev => ({
                    ...prev,
                    bookingId: data.bookingId,
                    pnr: data.pnr,
                    tickets: data.tickets,
                }));
            }
            // Success — booking confirmed (PNR may still be pending for some providers)
            setStep('success');
        } catch (e) {
            // Network-level error — payment may already have been captured
            // Show success to avoid confusion but log the error
            console.error('[confirmBooking] Network error during confirm:', e);
            setStep('success');
        }
    }, []);


    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!offer) return;

        try {
            flightBookingSchema.parse({ passengers, contact });
            bookMutation.mutate({ offer, passengers, contact });
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
        step,
        setStep, // Exported to allow manual transition if needed
        errorMsg,
        bookingResult,
        clientSecret, // Exported for Stripe Elements provider
        passengers,
        contact,
        updatePassenger,
        addPassenger,
        removePassenger,
        setContact,
        handleSubmit,
        pollForBooking, // Called by StripeEmbeddedCheckout onSuccess to start PNR polling
        router,
    };
}
