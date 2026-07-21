'use client';

import { useMutation } from '@tanstack/react-query';
import { useBookingActions } from '@/stores/bookingStore';
import { apiFetch } from '@/lib/api/client';
import { isRoomUnavailableError } from '@/lib/utils';
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
      adults?: number;
      children?: number;
      roomName?: string;
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
      // "Room unavailable" is an expected outcome (prebook returned success:false),
      // not a bug — log it as a warning so it doesn't surface in the Next.js dev
      // error overlay. Only genuinely unexpected errors log as console.error.
      if (isRoomUnavailableError(error.message)) {
        console.warn('[usePrebook] Room unavailable:', error.message);
      } else {
        console.error('[usePrebook] Error:', error);
      }
      options?.onError?.(error);
    },
  });
}
