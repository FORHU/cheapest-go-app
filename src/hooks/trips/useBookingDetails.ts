'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';

/**
 * Hook to fetch booking details for a given bookingId.
 */
export function useBookingDetails(bookingId: string | null, enabled: boolean = true) {
  return useQuery({
    queryKey: ['bookingDetails', bookingId],
    queryFn: async () => {
      if (!bookingId) throw new Error('No booking ID');

      const result = await apiFetch('/api/booking/details', { bookingId });

      if (!result.success) {
        throw new Error(result.error || 'Failed to get booking details');
      }

      return result.data;
    },
    enabled: !!bookingId && enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
