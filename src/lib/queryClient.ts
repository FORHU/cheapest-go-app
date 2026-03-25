import { QueryClient } from '@tanstack/react-query';

/**
 * Per-query-type staleTime constants.
 * Use these when calling useQuery to override the global default.
 */
export const staleTimes = {
  flights: 1000 * 30,          // 30s  — prices change frequently
  landing: 1000 * 60 * 30,     // 30m  — matches ISR revalidate on /
  exchangeRates: 1000 * 60 * 60, // 1h  — FX rates are slow-moving
  bookingDetails: Infinity,    // never stale — immutable once confirmed
  admin: 1000 * 60 * 2,        // 2m   — near-realtime dashboard data
};

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
 * admin.*: used by useDashboardData
 * autocomplete.*: used by DestinationPicker
 * exchangeRates.*: used by currency conversion hooks
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
  admin: {
    all: ['admin'] as const,
    stats: () => [...queryKeys.admin.all, 'stats'] as const,
    analytics: () => [...queryKeys.admin.all, 'analytics'] as const,
    supplierBreakdown: () => [...queryKeys.admin.all, 'supplier-breakdown'] as const,
    activity: () => [...queryKeys.admin.all, 'activity'] as const,
  },
  autocomplete: {
    all: ['autocomplete'] as const,
    destinations: (query: string) => [...queryKeys.autocomplete.all, 'destinations', query] as const,
  },
  exchangeRates: {
    all: ['exchange-rates'] as const,
    pair: (from: string, to: string) => [...queryKeys.exchangeRates.all, from, to] as const,
  },
};
