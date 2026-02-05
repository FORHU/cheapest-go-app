'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { bookingService, AmendBookingParams, AmendBookingResponse } from '@/services/booking.service';
import { queryKeys } from '@/lib/queryClient';
import { toast } from 'sonner';

/**
 * React Query mutation hook for amending a booking's holder information.
 * Calls the LiteAPI amend endpoint via edge function (which also updates local DB).
 * Automatically invalidates the trips query on success.
 */
export function useAmendBooking() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (params: AmendBookingParams): Promise<AmendBookingResponse> => {
            return bookingService.amendBooking(params);
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
