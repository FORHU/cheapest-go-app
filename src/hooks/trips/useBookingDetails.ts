'use client';

import { useQuery } from '@tanstack/react-query';
import { bookingService, BookingDetailsResponse } from '@/services/booking.service';
import { queryKeys } from '@/lib/queryClient';

/**
 * React Query hook for fetching booking details from LiteAPI.
 * Used by CancellationModal to get cancellation policies.
 *
 * @param bookingId - The booking ID to fetch details for
 * @param enabled - Whether the query should execute (e.g., only when modal is open)
 */
export function useBookingDetails(bookingId: string, enabled: boolean) {
    return useQuery<BookingDetailsResponse>({
        queryKey: queryKeys.trips.bookingDetails(bookingId),
        queryFn: () => bookingService.getBookingDetails(bookingId),
        enabled,
        staleTime: 5 * 60 * 1000, // 5 min cache
    });
}
