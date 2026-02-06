'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { amendBooking as amendBookingAction, AmendBookingParams, AmendBookingResult } from '@/app/actions';
import { queryKeys } from '@/lib/queryClient';
import { toast } from 'sonner';

/**
 * React Query mutation hook for amending a booking's holder information.
 * Uses Server Action for secure server-side processing.
 * Automatically invalidates the trips query on success.
 */
export function useAmendBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: AmendBookingParams): Promise<NonNullable<AmendBookingResult['data']>> => {
      const result = await amendBookingAction(params);

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Amendment failed');
      }

      return result.data;
    },
    onSuccess: (_result, variables) => {
      toast.success('Booking updated successfully', {
        description: `Holder updated to ${variables.firstName} ${variables.lastName}`,
      });

      // Invalidate trips list so it refetches with updated holder info
      queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
    },
    onError: (err: Error) => {
      console.error('Amendment failed:', err);
      toast.error('Failed to update booking', {
        description: err.message || 'Please try again or contact support',
      });
    },
  });
}
