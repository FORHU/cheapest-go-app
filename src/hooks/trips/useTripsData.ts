'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUser } from '@/stores/authStore';
import type { BookingRecord } from '@/services/booking.service';
import { getUserBookings } from '@/app/actions';
import { queryKeys } from '@/lib/queryClient';

interface UseTripsDataReturn {
    bookings: BookingRecord[];
    isLoading: boolean;
    error: string | null;
    upcomingBookings: BookingRecord[];
    pastBookings: BookingRecord[];
    cancelledBookings: BookingRecord[];
    refetch: () => Promise<void>;
}

/**
 * Hook for fetching and managing user trip/booking data.
 * Uses React Query for caching, background refetch, and stale-while-revalidate.
 */
export function useTripsData(): UseTripsDataReturn {
    const user = useUser();

    const query = useQuery({
        queryKey: queryKeys.trips.list(user?.id),
        queryFn: async () => {
            const result = await getUserBookings();
            if (!result.success) throw new Error(result.error || 'Failed to fetch bookings');
            return (result.data || []) as BookingRecord[];
        },
        enabled: !!user,
    });

    const bookings = query.data ?? [];

    // Categorize bookings (derived state)
    const upcomingBookings = useMemo(() => {
        const now = new Date();
        return bookings.filter(b => new Date(b.check_in) >= now && b.status !== 'cancelled');
    }, [bookings]);

    const pastBookings = useMemo(() => {
        const now = new Date();
        return bookings.filter(b => new Date(b.check_out) < now || b.status === 'completed');
    }, [bookings]);

    const cancelledBookings = useMemo(
        () => bookings.filter(b => b.status === 'cancelled'),
        [bookings]
    );

    const refetch = async () => {
        await query.refetch();
    };

    return {
        bookings,
        isLoading: query.isLoading,
        error: query.error?.message ?? null,
        upcomingBookings,
        pastBookings,
        cancelledBookings,
        refetch,
    };
}
