'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { confirmBooking as confirmBookingAction, BookingParams, BookingResult } from '@/app/actions';
import { queryKeys } from '@/lib/queryClient';
import { useBookingActions } from '@/stores/bookingStore';

/**
 * Options for useBooking mutation
 */
export interface UseBookingOptions {
  onSuccess?: (data: NonNullable<BookingResult['data']>) => void;
  onError?: (error: Error) => void;
}

/**
 * React Query mutation hook for booking confirmation.
 * Uses Server Action for secure server-side processing.
 *
 * @example
 * ```tsx
 * const { mutate: confirmBooking, isPending, error } = useBooking({
 *   onSuccess: (data) => console.log('Booked:', data.bookingId),
 * });
 *
 * // Confirm booking
 * confirmBooking({
 *   prebookId: 'prebook-123',
 *   holder: { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
 *   guests: [{ occupancyNumber: 1, firstName: 'John', lastName: 'Doe', email: 'john@example.com' }],
 *   payment: { method: 'ACC_CREDIT_CARD' }
 * });
 * ```
 */
export function useBooking(options: UseBookingOptions = {}) {
  const queryClient = useQueryClient();
  const { setBookingId } = useBookingActions();

  return useMutation({
    mutationFn: async (params: BookingParams) => {
      const result = await confirmBookingAction(params);

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Booking confirmation failed');
      }

      return result.data;
    },

    onSuccess: (data) => {
      // Store bookingId in Zustand
      if (data.bookingId) {
        setBookingId(data.bookingId);
      }

      // Invalidate booking queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.booking.all,
      });

      // Call custom success handler
      options.onSuccess?.(data);
    },

    onError: (error: Error) => {
      console.error('Booking error:', error);
      options.onError?.(error);
    },
  });
}
