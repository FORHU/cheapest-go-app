import { QueryClient } from '@tanstack/react-query';

/**
 * React Query client with optimized default configuration
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes - data stays fresh
      gcTime: 1000 * 60 * 30, // 30 minutes - garbage collection time
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

/**
 * Query key factory — centralized key management for cache invalidation.
 *
 * booking.all: invalidated by usePrebook, useBooking
 * trips.all: invalidated by useCancelBooking, useAmendBooking
 * trips.bookingDetails: used by useBookingDetails (on-demand modal fetch)
 * search/property: reserved for future SSR-cache-backed queries
 */
export const queryKeys = {
  search: {
    all: ['search'] as const,
    results: (params: Record<string, unknown>) => [...queryKeys.search.all, params] as const,
  },
  property: {
    all: ['property'] as const,
    detail: (id: string) => [...queryKeys.property.all, id] as const,
  },
  booking: {
    all: ['booking'] as const,
  },
  trips: {
    all: ['trips'] as const,
    bookingDetails: (bookingId: string) => [...queryKeys.trips.all, 'details', bookingId] as const,
  },
};
