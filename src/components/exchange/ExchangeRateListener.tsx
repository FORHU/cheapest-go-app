"use client";

import { useEffect } from 'react';
import { refreshExchangeRates } from '@/lib/currency';

/**
 * Invisible component that hydrates EXCHANGE_RATES with live data on app mount.
 * Follows the same pattern as AuthListener.
 */
export const ExchangeRateListener = () => {
    useEffect(() => {
        refreshExchangeRates();
    }, []);

    return null;
};
