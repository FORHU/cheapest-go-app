'use client';

import { useQuery } from '@tanstack/react-query';
import { getBookingDetails as getBookingDetailsAction, BookingDetailsResult } from '@/app/actions';
import { queryKeys } from '@/lib/queryClient';

/**
 * React Query hook for fetching booking details from LiteAPI.
 * Uses Server Action for secure server-side processing.
 * Used by CancellationModal to get cancellation policies.
 *
 * @param bookingId - The booking ID to fetch details for
 * @param enabled - Whether the query should execute (e.g., only when modal is open)
 */
export function useBookingDetails(bookingId: string, enabled: boolean) {
  return useQuery<NonNullable<BookingDetailsResult['data']>>({
    queryKey: queryKeys.trips.bookingDetails(bookingId),
    queryFn: async () => {
      const result = await getBookingDetailsAction(bookingId);

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to get booking details');
      }

      return result.data;
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 min cache
  });
}
