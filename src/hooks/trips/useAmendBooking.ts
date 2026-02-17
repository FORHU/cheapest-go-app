'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/queryClient';
import { toast } from 'sonner';

/**
 * Hook wrapping the amend booking API call.
 */
export function useAmendBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      bookingId: string;
      firstName: string;
      lastName: string;
      email: string;
      remarks?: string;
    }) => {
      const result = await apiFetch('/api/booking/amend', params);

      if (!result.success) {
        throw new Error(result.error || 'Amendment failed');
      }

      return result.data;
    },
    onSuccess: () => {
      toast.success('Booking updated successfully');
      queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update booking');
    },
  });
}
