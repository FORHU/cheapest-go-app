'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { prebookRoom, PrebookParams, PrebookResult } from '@/app/actions';
import { queryKeys } from '@/lib/queryClient';
import { useBookingActions } from '@/stores/bookingStore';

/**
 * Options for usePrebook mutation
 */
export interface UsePrebookOptions {
  onSuccess?: (data: NonNullable<PrebookResult['data']>) => void;
  onError?: (error: Error) => void;
}

/**
 * React Query mutation hook for prebook operation.
 * Uses Server Action for secure server-side processing.
 *
 * @example
 * ```tsx
 * const { mutate: prebook, isPending, error } = usePrebook({
 *   onSuccess: (data) => console.log('Prebooked:', data.prebookId),
 * });
 *
 * // Trigger prebook
 * prebook({ offerId: 'offer-123', currency: 'PHP' });
 * ```
 */
export function usePrebook(options: UsePrebookOptions = {}) {
  const queryClient = useQueryClient();
  const { setPrebookId } = useBookingActions();

  return useMutation({
    mutationFn: async (params: PrebookParams) => {
      const result = await prebookRoom(params);

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Prebook failed');
      }

      return result.data;
    },

    onSuccess: (data) => {
      // Store prebookId in Zustand
      if (data.prebookId) {
        setPrebookId(data.prebookId);
      }

      // Invalidate any related booking queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.booking.all,
      });

      // Call custom success handler
      options.onSuccess?.(data);
    },

    onError: (error: Error) => {
      console.error('Prebook error:', error);
      options.onError?.(error);
    },
  });
}
