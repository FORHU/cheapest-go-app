'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { bookingService, CancellationResponse } from '@/services/booking.service';
import { queryKeys } from '@/lib/queryClient';
import { toast } from 'sonner';

/**
 * React Query mutation hook for cancelling a booking.
 * Handles both the LiteAPI cancellation and local database status update in parallel.
 * Automatically invalidates the trips query on success.
 */
export function useCancelBooking() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (bookingId: string): Promise<CancellationResponse> => {
            const [result] = await Promise.all([
                bookingService.cancelBooking(bookingId),
                bookingService.updateBookingStatus(bookingId, 'cancelled'),
            ]);
            return result;
        },
        onSuccess: (result) => {
            toast.success('Booking cancelled successfully', {
                description: result.refund
                    ? `Refund of ${result.refund.currency} ${result.refund.amount.toFixed(2)} will be processed`
                    : 'Your booking has been cancelled',
            });

            // Invalidate trips list so it refetches
            queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
        },
        onError: (err: Error) => {
            console.error('Cancellation failed:', err);
            toast.error('Cancellation failed', {
                description: err.message || 'Please try again or contact support',
            });
        },
    });
}
