"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { flightBookingSchema, FlightPassengerForm, FlightContactForm } from '@/lib/schemas/flight';
import type { FlightOffer } from '@/lib/flights/types';
import { createClient } from '@/utils/supabase/client';

export type BookingStep = 'form' | 'submitting' | 'success' | 'error';

export function useFlightBooking() {
    const router = useRouter();
    const [offer, setOffer] = useState<FlightOffer | null>(null);
    const [step, setStep] = useState<BookingStep>('form');
    const [errorMsg, setErrorMsg] = useState('');
    const [bookingResult, setBookingResult] = useState<{
        bookingId: string;
        pnr: string;
        tickets?: { name: string; number: string }[];
    } | null>(null);

    // HIGH-2 FIX: Idempotency key to prevent double bookings
    const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

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
        try {
            setOffer(JSON.parse(raw));
        } catch {
            router.replace('/');
        }
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
            setBookingResult({
                bookingId: data.bookingId,
                pnr: data.pnr,
                tickets: data.tickets
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
                        useAuthStore.getState().openAuthModal('email');
                    });
                }
            } else {
                setErrorMsg(error.message || 'Booking failed. Please try again.');
                setStep('error');
                // Generate a new idempotency key for retry
                idempotencyKeyRef.current = crypto.randomUUID();
            }
        }
    });

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
        errorMsg,
        bookingResult,
        passengers,
        contact,
        updatePassenger,
        addPassenger,
        removePassenger,
        setContact,
        handleSubmit,
        router,
    };
}
