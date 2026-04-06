'use client';

import { useMutation } from '@tanstack/react-query';
import { useBookingActions } from '@/stores/bookingStore';
import { apiFetch } from '@/lib/api/client';
import type { PrebookResponse } from '@/services';

export interface UsePrebookOptions {
  onSuccess?: (data: PrebookResponse, variables: {
    offerId: string;
    currency: string;
    voucherCode?: string;
  }) => void;
  onError?: (error: Error) => void;
}

/**
 * Hook wrapping the prebook API call.
 */
export function usePrebook(options?: UsePrebookOptions) {
  const { setPrebookId } = useBookingActions();

  return useMutation({
    mutationFn: async (params: {
      offerId: string;
      currency: string;
      voucherCode?: string;
    }) => {
      const result = await apiFetch<PrebookResponse>('/api/booking/prebook', params);

      if (!result.success) {
        throw new Error(result.error || 'Prebook failed');
      }

      return result.data;
    },
    onSuccess: (data, variables) => {
      if (data?.prebookId) {
        setPrebookId(data.prebookId);
      }
      options?.onSuccess?.(data, variables);
    },
    onError: (error: Error) => {
      console.error('[usePrebook] Error:', error);
      const isUnavailable = /no longer available|not available|unavailable|sold out/i.test(error.message);
      if (isUnavailable) {
        console.warn('[usePrebook] Room unavailable:', error.message);
      }
      options?.onError?.(error);
    },
  });
}
