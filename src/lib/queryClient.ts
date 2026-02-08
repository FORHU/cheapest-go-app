import { QueryClient } from '@tanstack/react-query';

/**
 * React Query client with optimized default configuration
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes - data stays fresh
      gcTime: 1000 * 60 * 30, // 30 minutes - garbage collection time (formerly cacheTime)
      retry: 1, // Retry failed requests once
      refetchOnWindowFocus: false, // Don't refetch on window focus for better UX
    },
    mutations: {
      retry: 0, // Don't retry mutations by default
    },
  },
});

/**
 * Query Keys — only keys actually used by hooks.
 * booking.all: invalidated by usePrebook, useBooking
 * trips.all: invalidated by useCancelBooking, useAmendBooking
 * trips.bookingDetails: used by useBookingDetails (on-demand modal fetch)
 */
export const queryKeys = {
  booking: {
    all: ['booking'] as const,
  },
  trips: {
    all: ['trips'] as const,
    bookingDetails: (bookingId: string) => [...queryKeys.trips.all, 'details', bookingId] as const,
  },
};
