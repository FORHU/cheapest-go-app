'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    useProperty,
    useSelectedRoom,
    useBookingDates,
    useBookingId,
} from '@/stores/bookingStore';
import { useUserCurrency } from '@/stores/searchStore';
import { HotelBookingConfirmed } from '@/components/checkout/HotelBookingConfirmed';
import { Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api/client';
import { useBookingStore } from '@/stores/bookingStore';

interface CheckoutSession {
    ts: number;
    holder: { firstName: string; lastName: string; email: string };
    guests: { firstName: string; lastName: string }[];
    specialRequests: string;
    currency: string;
}

const THIRTY_MIN = 30 * 60 * 1000;

function readCheckoutSession(): CheckoutSession | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = sessionStorage.getItem('hotelCheckoutSession');
        if (!raw) return null;
        const parsed = JSON.parse(raw) as CheckoutSession;
        if (Date.now() - parsed.ts > THIRTY_MIN) {
            sessionStorage.removeItem('hotelCheckoutSession');
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

/**
 * Shown after a hotel booking completes — both the direct path (no 3DS redirect)
 * and the Stripe 3DS redirect path (Stripe appends ?payment_intent=xxx&redirect_status=succeeded).
 * Data is read from the Zustand booking store (persisted to localStorage).
 * Holder/guest data for 3DS recovery is read from sessionStorage (set in CheckoutContent).
 */
export function HotelConfirmedContent() {
    const searchParams = useSearchParams();
    const paymentIntentFromUrl = searchParams.get('payment_intent');
    const redirectStatus = searchParams.get('redirect_status');

    const property = useProperty();
    const selectedRoom = useSelectedRoom();
    const { checkIn, checkOut } = useBookingDates();
    const bookingId = useBookingId();
    const currency = useUserCurrency();

    const [confirming, setConfirming] = useState(false);
    const [confirmError, setConfirmError] = useState<string | null>(null);

    // If arriving from a Stripe 3DS redirect and we don't yet have a bookingId,
    // call /api/booking/confirm using the payment intent ID from the URL and the
    // holder/guest data saved in sessionStorage before the redirect happened.
    useEffect(() => {
        if (
            redirectStatus === 'succeeded' &&
            paymentIntentFromUrl &&
            !bookingId
        ) {
            const store = useBookingStore.getState();
            const prebookId = store.prebookId;
            const room = store.selectedRoom;
            const prop = store.property;
            const session = readCheckoutSession();

            if (!prebookId || !room?.offerId) {
                setConfirmError('Booking session expired. Please check My Trips or contact support.');
                return;
            }

            const holder = session?.holder ?? { firstName: '', lastName: '', email: '' };
            const guests = session?.guests ?? [{ firstName: '', lastName: '' }];

            setConfirming(true);

            apiFetch('/api/booking/confirm', {
                prebookId,
                holder,
                guests,
                payment: { method: 'ACC_CREDIT_CARD' },
                paymentIntentId: paymentIntentFromUrl,
                propertyName: prop?.name || 'Hotel',
                propertyImage: prop?.images?.[0],
                roomName: room?.title || 'Room',
                checkIn: store.checkIn?.toISOString().split('T')[0] ?? '',
                checkOut: store.checkOut?.toISOString().split('T')[0] ?? '',
                adults: store.adults,
                children: store.children,
                currency: room?.currency || session?.currency || currency,
                specialRequests: session?.specialRequests || undefined,
            })
                .then((result) => {
                    if (result.success && (result.data as any)?.bookingId) {
                        store.setBookingId((result.data as any).bookingId);
                        sessionStorage.removeItem('hotelCheckoutSession');
                    } else {
                        setConfirmError('Could not confirm booking. Check My Trips for your reservation status.');
                    }
                })
                .catch(() => {
                    setConfirmError('Could not confirm booking. Check My Trips for your reservation status.');
                })
                .finally(() => setConfirming(false));
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    if (confirming) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-4">
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
                <p className="text-sm text-slate-500">Confirming your booking…</p>
            </div>
        );
    }

    if (confirmError) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
                <p className="text-red-600 font-medium">{confirmError}</p>
                <a href="/trips" className="text-indigo-600 underline text-sm">Go to My Trips</a>
            </div>
        );
    }

    return (
        <HotelBookingConfirmed
            propertyName={property?.name || 'Hotel'}
            propertyImage={property?.images?.[0] || property?.image}
            bookingId={bookingId}
            roomTitle={selectedRoom?.title || 'Room'}
            checkIn={checkIn}
            checkOut={checkOut}
            chargedTotal={selectedRoom?.price ?? 0}
            currency={currency}
        />
    );
}
