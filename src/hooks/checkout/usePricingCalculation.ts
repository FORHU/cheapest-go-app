'use client';

import { useMemo } from 'react';
import { useProperty, useSelectedRoom, useBookingDates } from '@/stores/bookingStore';
import { useCheckoutStore } from '@/stores/checkoutStore';
import { convertCurrency } from '@/lib/currency';

interface Surcharge {
    chargeType: string;
    mandatory: boolean;
    price: { net: number; gross: number; currency: string };
}

interface PriceData {
    price?: number;
    tax?: number;
    total?: number;
    currency?: string;
    surcharges?: Surcharge[];
}

interface UsePricingCalculationOptions {
    priceData: PriceData | null;
}

interface ConvertedSurcharge {
    chargeType: string;
    mandatory: boolean;
    amount: number;
}

interface UsePricingCalculationReturn {
    displayProperty: { name: string; rating: number; image: string };
    displayRoom: { title: string; price: number };
    totalNights: number;
    roomPrice: number;
    taxes: number;
    totalPrice: number;
    /** Platform service fee (5% of totalPrice) shown at checkout per §10(d) */
    serviceFee: number;
    /** Actual amount charged to the customer (totalPrice + serviceFee) */
    chargedTotal: number;
    surcharges: ConvertedSurcharge[];
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
        // When prebook data is present, use priceData.currency (authoritative from LiteAPI).
        // Fall back to the room's stored search currency, then selectedCurrency.
        const sourceCurrency = priceData?.currency || displayRoom.currency || selectedCurrency;

        // Apply client-side conversion when the display currency differs
        const roomPrice = convertCurrency(rawRoomPrice, sourceCurrency, selectedCurrency);
        const taxes = convertCurrency(rawTaxes, sourceCurrency, selectedCurrency);
        const totalPrice = convertCurrency(rawTotal, sourceCurrency, selectedCurrency);

        const surcharges: ConvertedSurcharge[] = (priceData?.surcharges ?? [])
            .filter(s => s.chargeType?.toUpperCase() !== 'INCLUDE')
            .map(s => ({
                chargeType: s.chargeType,
                mandatory: s.mandatory,
                amount: Math.round(convertCurrency(s.price.gross, s.price.currency || sourceCurrency, selectedCurrency) * 100) / 100,
            }));

        const roundedTotal = Math.round(totalPrice * 100) / 100;
        const serviceFee   = Math.round(roundedTotal * 0.05 * 100) / 100;

        return {
            displayProperty,
            displayRoom,
            totalNights,
            roomPrice: Math.round(roomPrice * 100) / 100,
            taxes: Math.round(taxes * 100) / 100,
            totalPrice: roundedTotal,
            serviceFee,
            chargedTotal: Math.round((roundedTotal + serviceFee) * 100) / 100,
            surcharges,
        };
    }, [property, selectedRoom, checkIn, checkOut, priceData, selectedCurrency]);
}
