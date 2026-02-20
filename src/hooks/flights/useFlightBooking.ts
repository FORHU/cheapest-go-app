"use client";

import { useState, useEffect } from 'react';
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
    const [bookingResult, setBookingResult] = useState<{ bookingId: string; pnr: string } | null>(null);

    const [passengers, setPassengers] = useState<FlightPassengerForm[]>([{
        type: 'ADT', firstName: '', lastName: '', gender: '', birthDate: '',
        nationality: 'KR', passport: '', passportExpiry: '',
    }]);

    const [contact, setContact] = useState<FlightContactForm>({
        email: '', phone: '', countryCode: '82',
        addressLine: '', city: '', postalCode: '', country: 'KR',
    });

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
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                throw new Error("unauthenticated");
            }

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
                })),
                rawOffer: (offer as any)._raw,
            };

            const res = await fetch('/api/flights/book', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.id,
                    provider: offer.provider,
                    flight: flightPayload,
                    passengers,
                    contact,
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
            setBookingResult({ bookingId: data.bookingId, pnr: data.pnr });
            setStep('success');
            sessionStorage.removeItem('selectedFlight');
        },
        onError: (error) => {
            if (error.message === "unauthenticated") {
                router.push('/login');
            } else {
                setErrorMsg(error.message || 'Booking failed. Please try again.');
                setStep('error');
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
                // Use the first validation error message
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
