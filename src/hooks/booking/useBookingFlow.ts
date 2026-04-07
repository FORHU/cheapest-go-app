import { useState, useCallback } from 'react';
import { usePrebook } from '../mutations/usePrebook';
import { useBooking } from '../mutations/useBooking';
import {
  usePrebookId,
  useSelectedRoom,
  useBookingActions,
} from '@/stores/bookingStore';
import { useCheckoutStore } from '@/stores/checkoutStore';
import type { BookingParams, PrebookResponse, CancellationPolicy } from '@/services';
import { apiFetch } from '@/lib/api/client';
import { toast } from 'sonner';

/**
 * Price data from prebook response
 */
export interface PriceData {
  price: number;
  tax: number;
  total: number;
  currency: string;
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

  /** Payment SDK secret key from prebook (when usePaymentSdk: true) */
  secretKey: string | null;
  /** Payment SDK transaction ID from prebook (when usePaymentSdk: true) */
  transactionId: string | null;

  // Actions
  startPrebook: (offerId: string, currency: string, voucherCode?: string) => Promise<PrebookResponse>;
  completeBooking: (params: Omit<BookingParams, 'prebookId'>) => Promise<void>;
  refreshPrebook: (offerId: string, currency: string, voucherCode?: string) => Promise<PrebookResponse>;
  /** Re-prebook with a voucher code (triggers new secretKey/transactionId) */
  reprebookWithVoucher: (voucherCode: string) => Promise<PrebookResponse | null>;
  /** Re-prebook without voucher (when voucher is removed) */
  reprebookWithoutVoucher: () => Promise<PrebookResponse | null>;

  // Helpers
  reset: () => void;
}

/**
 * High-level hook that orchestrates the complete booking flow.
 */
export function useBookingFlow(): UseBookingFlowReturn {
  const prebookId = usePrebookId();
  const selectedRoom = useSelectedRoom();
  const { setPrebookId, setBookingId } = useBookingActions();

  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [secretKey, setSecretKey] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState<string | null>(null);

  // Prebook mutation
  const prebookMutation = usePrebook({
    onSuccess: (data, variables) => {
      // Update price data if available
      if (data.price) {
        console.log('[useBookingFlow] Prebook Success:', {
          requestedCurrency: variables.currency,
          receivedCurrency: data.currency,
          price: data.price.total,
          taxes: data.price.taxes
        });
        setPriceData({
          price: data.price.subtotal || data.price.total,
          tax: data.price.taxes || 0,
          total: data.price.total,
          currency: data.currency || variables.currency,
          cancellationPolicies: data.cancellationPolicies,
        });
      }

      // Store Payment SDK credentials
      if (data.secretKey) {
        setSecretKey(data.secretKey);
      }
      if (data.transactionId) {
        setTransactionId(data.transactionId);
      }
    },
    onError: (err: any) => {
      console.error('[useBookingFlow] Prebook Error:', err);
      toast.error(err?.message || "Failed to update price for the selected currency.");
    }
  });

  // Booking mutation
  const bookingMutation = useBooking();

  /**
   * Start the prebook process
   */
  const startPrebook = useCallback(
    async (offerId: string, currency: string, voucherCode?: string): Promise<PrebookResponse> => {
      console.log('[useBookingFlow] Starting Prebook:', { offerId, currency, voucherCode });
      setPriceData(null); // Clear stale price data
      const params: { offerId: string; currency: string; voucherCode?: string } = { offerId, currency };
      if (voucherCode) params.voucherCode = voucherCode;
      return prebookMutation.mutateAsync(params);
    },
    [prebookMutation.mutateAsync]
  );

  /**
   * Refresh an expired prebook session
   */
  const refreshPrebook = useCallback(
    async (offerId: string, currency: string, voucherCode?: string): Promise<PrebookResponse> => {
      const params: { offerId: string; currency: string; voucherCode?: string } = { offerId, currency };
      if (voucherCode) params.voucherCode = voucherCode;

      const result = await apiFetch<PrebookResponse>('/api/booking/prebook', params as unknown as Record<string, unknown>);
      if (!result.success) {
        throw new Error(result.error || 'Refresh prebook failed');
      }

      const data = result.data;
      if (!data) {
          throw new Error('Refresh prebook failed: No data returned');
      }

      prebookMutation.reset();

      if (data.prebookId) setPrebookId(data.prebookId);
      if (data.secretKey) setSecretKey(data.secretKey);
      if (data.transactionId) setTransactionId(data.transactionId);
      
      if (data.price) {
        setPriceData({
          price: data.price.subtotal || data.price.total,
          tax: data.price.taxes || 0,
          total: data.price.total,
          currency: data.currency || currency,
          cancellationPolicies: data.cancellationPolicies,
        });
      }
      
      return data;
    },
    [setPrebookId, prebookMutation]
  );

  /**
   * Re-prebook with a voucher code
   */
  const reprebookWithVoucher = useCallback(
    async (voucherCode: string): Promise<PrebookResponse | null> => {
      if (!selectedRoom?.offerId) return null;
      const currentCurrency = useCheckoutStore.getState().selectedCurrency || 'PHP';

      const result = await apiFetch<PrebookResponse>('/api/booking/prebook', {
        offerId: selectedRoom.offerId,
        currency: currentCurrency,
        voucherCode,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to apply voucher to booking');
      }

      const data = result.data;
      if (!data) {
          throw new Error('Failed to apply voucher: No data returned');
      }

      prebookMutation.reset();
      if (data.prebookId) setPrebookId(data.prebookId);
      if (data.secretKey) setSecretKey(data.secretKey);
      if (data.transactionId) setTransactionId(data.transactionId);

      if (data.price) {
        setPriceData({
          price: data.price.subtotal || data.price.total,
          tax: data.price.taxes || 0,
          total: data.price.total,
          currency: data.currency || currentCurrency,
          cancellationPolicies: data.cancellationPolicies,
        });
      }

      return data;
    },
    [selectedRoom?.offerId, setPrebookId, prebookMutation]
  );

  /**
   * Re-prebook without voucher
   */
  const reprebookWithoutVoucher = useCallback(
    async (): Promise<PrebookResponse | null> => {
      if (!selectedRoom?.offerId) return null;
      const currentCurrency = useCheckoutStore.getState().selectedCurrency || 'PHP';

      const result = await apiFetch<PrebookResponse>('/api/booking/prebook', {
        offerId: selectedRoom.offerId,
        currency: currentCurrency,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to refresh booking session');
      }

      const data = result.data;
      if (!data) {
          throw new Error('Failed to refresh booking session: No data returned');
      }

      prebookMutation.reset();
      if (data.prebookId) setPrebookId(data.prebookId);
      if (data.secretKey) setSecretKey(data.secretKey);
      if (data.transactionId) setTransactionId(data.transactionId);

      if (data.price) {
        setPriceData({
          price: data.price.subtotal || data.price.total,
          tax: data.price.taxes || 0,
          total: data.price.total,
          currency: data.currency || currentCurrency,
          cancellationPolicies: data.cancellationPolicies,
        });
      }

      return data;
    },
    [selectedRoom?.offerId, setPrebookId, prebookMutation]
  );

  /**
   * Complete the booking
   */
  const completeBooking = useCallback(
    async (params: Omit<BookingParams, 'prebookId'>): Promise<void> => {
      let currentPrebookId = prebookId;
      if (!currentPrebookId) throw new Error('No prebook ID available.');

      const bookingParams = { ...params, prebookId: currentPrebookId };

      try {
        await bookingMutation.mutateAsync(bookingParams);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '';
        const errorCode = (error as { code?: string })?.code || errorMessage.match(/\d{4}/)?.[0];
        const isExpiredSession = errorCode === '2012' || errorCode === '2010';

        if (isExpiredSession && selectedRoom?.offerId) {
          const currentCurrency = useCheckoutStore.getState().selectedCurrency || 'PHP';
          const refreshResult = await refreshPrebook(selectedRoom.offerId, currentCurrency);
          if (refreshResult?.prebookId) {
            await bookingMutation.mutateAsync({ ...params, prebookId: refreshResult.prebookId });
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

  const reset = useCallback(() => {
    setPrebookId(null);
    setBookingId(null);
    setPriceData(null);
    setSecretKey(null);
    setTransactionId(null);
    prebookMutation.reset();
    bookingMutation.reset();
  }, [setPrebookId, setBookingId, prebookMutation, bookingMutation]);

  return {
    prebookId,
    priceData,
    isPrebooking: prebookMutation.isPending,
    isBooking: bookingMutation.isPending,
    isProcessing: prebookMutation.isPending || bookingMutation.isPending,
    prebookError: prebookMutation.error,
    bookingError: bookingMutation.error,
    secretKey,
    transactionId,
    startPrebook,
    completeBooking,
    refreshPrebook,
    reprebookWithVoucher,
    reprebookWithoutVoucher,
    reset,
  };
}
