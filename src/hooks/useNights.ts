'use client';

import { useMemo } from 'react';
import { useDates } from '@/stores/searchStore';
import { nightsBetween } from '@/lib/perNightPrice';

/** Nights in the active search — 1 when no dates are picked yet. */
export function useNights(): number {
    const { checkIn, checkOut } = useDates();
    return useMemo(() => nightsBetween(checkIn, checkOut), [checkIn, checkOut]);
}
