'use client';

import { useMemo } from 'react';
import { useProperty, useSelectedRoom, useBookingDates } from '@/stores/bookingStore';
import { useCheckoutStore } from '@/stores/checkoutStore';
import { convertCurrency } from '@/lib/currency';

interface PriceData {
    price?: number;
    tax?: number;
    total?: number;
    currency?: string;
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
 * Applies client-side currency conversion when the user's selected currency
 * differs from the room's original search currency.
 */
export function usePricingCalculation({
    priceData,
}: UsePricingCalculationOptions): UsePricingCalculationReturn {
    const property = useProperty();
    const selectedRoom = useSelectedRoom();
    const { checkIn, checkOut } = useBookingDates();
    const selectedCurrency = useCheckoutStore((state) => state.selectedCurrency);

    return useMemo(() => {
        const displayProperty = property || { name: "", rating: 0, image: "" };
        const displayRoom = selectedRoom || { title: "", price: 0, currency: "" };
        
        const totalNights = (checkIn && checkOut)
            ? Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24))
            : 0;

        const baseRoomPrice = displayRoom.price || 0;

        // Raw values from the prebook response — always in the room's original search currency
        const rawRoomPrice = priceData?.price ?? (baseRoomPrice * totalNights);
        const rawTaxes = priceData?.tax ?? (rawRoomPrice * 0.12);
        const rawTotal = priceData?.total ?? (rawRoomPrice + rawTaxes);

        // The currency the raw prices are denominated in.
        // LiteAPI prebook always returns prices in the original search currency,
        // regardless of the currency parameter we send. Use the room's stored currency.
        const sourceCurrency = displayRoom.currency || selectedCurrency;

        // Apply client-side conversion when the display currency differs
        const roomPrice = convertCurrency(rawRoomPrice, sourceCurrency, selectedCurrency);
        const taxes = convertCurrency(rawTaxes, sourceCurrency, selectedCurrency);
        const totalPrice = convertCurrency(rawTotal, sourceCurrency, selectedCurrency);

        return {
            displayProperty,
            displayRoom,
            totalNights,
            roomPrice: Math.round(roomPrice * 100) / 100,
            taxes: Math.round(taxes * 100) / 100,
            totalPrice: Math.round(totalPrice * 100) / 100,
        };
    }, [property, selectedRoom, checkIn, checkOut, priceData, selectedCurrency]);
}
