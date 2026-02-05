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
 * Query Keys Factory Pattern
 * Centralized query key management for type safety and consistency
 *
 * Usage:
 * - queryKeys.properties.all - ['properties']
 * - queryKeys.properties.detail('123') - ['properties', 'detail', '123']
 * - queryKeys.hotels.search(params) - ['hotels', 'search', params]
 */
export const queryKeys = {
  properties: {
    all: ['properties'] as const,
    lists: () => [...queryKeys.properties.all, 'list'] as const,
    list: (filters: string) => [...queryKeys.properties.lists(), filters] as const,
    details: () => [...queryKeys.properties.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.properties.details(), id] as const,
  },
  hotels: {
    all: ['hotels'] as const,
    detail: (id: string, params: any) => [...queryKeys.hotels.all, 'detail', id, params] as const,
    search: (params: any) => [...queryKeys.hotels.all, 'search', params] as const,
  },
  booking: {
    all: ['booking'] as const,
    prebook: (offerId: string, currency: string) => [
      ...queryKeys.booking.all,
      'prebook',
      offerId,
      currency,
    ] as const,
    confirm: (prebookId: string) => [
      ...queryKeys.booking.all,
      'confirm',
      prebookId,
    ] as const,
  },
  trips: {
    all: ['trips'] as const,
    list: (userId?: string) => [...queryKeys.trips.all, 'list', userId] as const,
    bookingDetails: (bookingId: string) => [...queryKeys.trips.all, 'details', bookingId] as const,
  },
  facilities: {
    all: ['facilities'] as const,
  },
  auth: {
    all: ['auth'] as const,
    user: () => [...queryKeys.auth.all, 'user'] as const,
    session: () => [...queryKeys.auth.all, 'session'] as const,
  },
};
