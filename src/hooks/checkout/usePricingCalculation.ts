'use client';

import { useMemo } from 'react';
import { useProperty, useSelectedRoom, useBookingDates } from '@/stores/bookingStore';

interface PriceData {
    price?: number;
    tax?: number;
    total?: number;
}

interface UsePricingCalculationOptions {
    priceData: PriceData | null;
}

interface UsePricingCalculationReturn {
    displayProperty: { name: string; rating: number; image: string };
    displayRoom: { title: string; price: number };
    totalNights: number;
    roomPrice: number;
    taxes: number;
    totalPrice: number;
}

/**
 * Hook to compute pricing and display values for checkout.
 * Memoized for performance.
 */
export function usePricingCalculation({
    priceData,
}: UsePricingCalculationOptions): UsePricingCalculationReturn {
    const property = useProperty();
    const selectedRoom = useSelectedRoom();
    const { checkIn, checkOut } = useBookingDates();

    return useMemo(() => {
        const displayProperty = property || { name: "", rating: 0, image: "" };
        const displayRoom = selectedRoom || { title: "", price: 0 };
        const totalNights = (checkIn && checkOut)
            ? Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24))
            : 0;
        const baseRoomPrice = displayRoom.price || 0;
        const roomPrice = priceData?.price ?? (baseRoomPrice * totalNights);
        const taxes = priceData?.tax ?? (roomPrice * 0.12);
        const totalPrice = priceData?.total ?? (roomPrice + taxes);

        return {
            displayProperty,
            displayRoom,
            totalNights,
            roomPrice,
            taxes,
            totalPrice,
        };
    }, [property, selectedRoom, checkIn, checkOut, priceData]);
}
