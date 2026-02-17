'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/queryClient';
import { toast } from 'sonner';

/**
 * Hook wrapping the cancel booking API call.
 */
export function useCancelBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bookingId: string) => {
      const result = await apiFetch('/api/booking/cancel', { bookingId });

      if (!result.success) {
        throw new Error(result.error || 'Cancellation failed');
      }

      return result.data;
    },
    onSuccess: () => {
      toast.success('Booking cancelled successfully');
      queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to cancel booking');
    },
  });
}
