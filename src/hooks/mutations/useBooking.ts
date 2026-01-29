import { useMutation, useQueryClient } from '@tanstack/react-query';
import { bookingService, BookingParams, BookingResponse } from '@/services';
import { queryKeys } from '@/lib/queryClient';
import { useBookingActions } from '@/stores/bookingStore';

/**
 * Options for useBooking mutation
 */
export interface UseBookingOptions {
  onSuccess?: (data: BookingResponse) => void;
  onError?: (error: Error) => void;
}

/**
 * React Query mutation hook for booking confirmation
 * Handles final booking submission with automatic state management
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
    mutationFn: (params: BookingParams) => bookingService.confirmBooking(params),

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
