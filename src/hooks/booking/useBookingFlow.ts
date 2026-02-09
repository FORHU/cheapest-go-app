import { useState, useCallback } from 'react';
import { usePrebook } from '../mutations/usePrebook';
import { useBooking } from '../mutations/useBooking';
import {
  usePrebookId,
  useSelectedRoom,
  useBookingActions,
} from '@/stores/bookingStore';
import type { BookingParams, PrebookResponse, CancellationPolicy } from '@/services';
import { prebookRoom } from '@/app/actions';

/**
 * Price data from prebook response
 */
export interface PriceData {
  price: number;
  tax: number;
  total: number;
  /** Cancellation policies from prebook */
  cancellationPolicies?: CancellationPolicy;
}

/**
 * Return type for useBookingFlow hook
 */
export interface UseBookingFlowReturn {
  // State
  prebookId: string | null | undefined;
  priceData: PriceData | null;
  isPrebooking: boolean;
  isBooking: boolean;
  isProcessing: boolean;
  prebookError: Error | null;
  bookingError: Error | null;

  // Actions
  startPrebook: (offerId: string, currency: string) => Promise<PrebookResponse>;
  completeBooking: (params: Omit<BookingParams, 'prebookId'>) => Promise<void>;
  refreshPrebook: (offerId: string, currency: string) => Promise<PrebookResponse>;

  // Helpers
  reset: () => void;
}

/**
 * High-level hook that orchestrates the complete booking flow
 * Combines prebook and booking mutations with automatic state management
 *
 * @example
 * ```tsx
 * const {
 *   isPrebooking,
 *   isBooking,
 *   priceData,
 *   startPrebook,
 *   completeBooking,
 * } = useBookingFlow();
 *
 * // Start prebook on mount
 * useEffect(() => {
 *   if (selectedRoom?.offerId) {
 *     startPrebook(selectedRoom.offerId, 'PHP');
 *   }
 * }, [selectedRoom?.offerId]);
 *
 * // Complete booking on form submit
 * const handleSubmit = async (formData) => {
 *   await completeBooking({
 *     holder: { firstName: formData.firstName, ... },
 *     guests: [...],
 *     payment: { method: 'ACC_CREDIT_CARD' }
 *   });
 * };
 * ```
 */
export function useBookingFlow(): UseBookingFlowReturn {
  const prebookId = usePrebookId();
  const selectedRoom = useSelectedRoom();
  const { setPrebookId, setBookingId } = useBookingActions();

  const [priceData, setPriceData] = useState<PriceData | null>(null);

  // Prebook mutation
  const prebookMutation = usePrebook({
    onSuccess: (data) => {
      // Update price data if available
      if (data.price) {
        setPriceData({
          price: data.price.subtotal || data.price.total,
          tax: data.price.taxes || 0,
          total: data.price.total,
          cancellationPolicies: data.cancellationPolicies,
        });
      }
    },
  });

  // Booking mutation
  const bookingMutation = useBooking();

  /**
   * Start the prebook process
   */
  const startPrebook = useCallback(
    async (offerId: string, currency: string): Promise<PrebookResponse> => {
      return prebookMutation.mutateAsync({ offerId, currency });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prebookMutation.mutateAsync]
  );

  /**
   * Refresh an expired prebook session
   */
  const refreshPrebook = useCallback(
    async (offerId: string, currency: string): Promise<PrebookResponse> => {
      const result = await prebookRoom({ offerId, currency });
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Refresh prebook failed');
      }
      if (result.data.prebookId) {
        setPrebookId(result.data.prebookId);
      }
      return result.data as PrebookResponse;
    },
    [setPrebookId]
  );

  /**
   * Complete the booking with provided details
   * Automatically uses the current prebookId from state
   */
  const completeBooking = useCallback(
    async (params: Omit<BookingParams, 'prebookId'>): Promise<void> => {
      let currentPrebookId = prebookId;

      if (!currentPrebookId) {
        throw new Error('No prebook ID available. Please select a room first.');
      }

      try {
        await bookingMutation.mutateAsync({
          ...params,
          prebookId: currentPrebookId,
        });
      } catch (error) {
        // Check if error is due to expired prebook session
        const errorMessage = error instanceof Error ? error.message : '';
        const errorCode = (error as { code?: string })?.code || errorMessage.match(/\d{4}/)?.[0];
        const isExpiredSession = errorCode === '2012' || errorCode === '2010';

        if (isExpiredSession && selectedRoom?.offerId) {
          const refreshResult = await refreshPrebook(
            selectedRoom.offerId,
            'PHP'
          );

          if (refreshResult?.prebookId) {
            currentPrebookId = refreshResult.prebookId;

            // Retry booking with new prebookId
            await bookingMutation.mutateAsync({
              ...params,
              prebookId: currentPrebookId,
            });
          } else {
            throw new Error('Could not refresh booking session');
          }
        } else {
          throw error;
        }
      }
    },
    [prebookId, selectedRoom?.offerId, bookingMutation, refreshPrebook]
  );

  /**
   * Reset booking state
   */
  const reset = useCallback(() => {
    setPrebookId(null);
    setBookingId(null);
    setPriceData(null);
    prebookMutation.reset();
    bookingMutation.reset();
  }, [setPrebookId, setBookingId, prebookMutation, bookingMutation]);

  return {
    // State
    prebookId,
    priceData,
    isPrebooking: prebookMutation.isPending,
    isBooking: bookingMutation.isPending,
    isProcessing: prebookMutation.isPending || bookingMutation.isPending,
    prebookError: prebookMutation.error,
    bookingError: bookingMutation.error,

    // Actions
    startPrebook,
    completeBooking,
    refreshPrebook,

    // Helpers
    reset,
  };
}
