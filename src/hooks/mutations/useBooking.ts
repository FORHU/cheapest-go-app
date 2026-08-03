'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useBookingActions } from '@/stores/bookingStore';
import { apiFetch } from '@/lib/api/client';
import type { BookingParams } from '@/services';

export interface UseBookingOptions {
  onSuccess?: (data: any) => void;
  onError?: (error: Error) => void;
}

/**
 * Hook wrapping the confirm booking API call.
 */
export function useBooking(options?: UseBookingOptions) {
  const queryClient = useQueryClient();
  const { setBookingId } = useBookingActions();

  return useMutation({
    mutationFn: async (params: BookingParams) => {
      const result = await apiFetch('/api/booking/confirm', params as unknown as Record<string, unknown>);

      if (!result.success) {
        const err = new Error(result.error || 'Booking failed') as Error & { errorCode?: string; oldPrice?: number; newPrice?: number };
        if (result.errorCode) err.errorCode = String(result.errorCode);
        if (result.oldPrice != null) err.oldPrice = Number(result.oldPrice);
        if (result.newPrice != null) err.newPrice = Number(result.newPrice);
        throw err;
      }

      return result.data;
    },
    onSuccess: (data: any) => {
      if (data?.bookingId) {
        setBookingId(data.bookingId);
      }
      // Invalidate trips query so list refreshes
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      options?.onSuccess?.(data);
    },
    onError: (error: Error) => {
      console.error('[useBooking] Error:', error);
      options?.onError?.(error);
    },
  });
}
