import { useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Serialization function to convert state to URL params
 */
export type SerializeFn<T> = (state: T) => Record<string, string>;

/**
 * Deserialization function to convert URL params to state
 */
export type DeserializeFn<T> = (params: URLSearchParams) => Partial<T>;

/**
 * When to sync state with URL
 */
export type SyncTiming = 'mount' | 'change' | 'both';

/**
 * Options for configuring URL synchronization
 */
export interface UseURLSyncOptions<T> {
  /** Convert state object to URL params */
  serialize?: SerializeFn<T>;
  /** Convert URL params to state object */
  deserialize?: DeserializeFn<T>;
  /** When to sync: 'mount' (initial load), 'change' (on state change), or 'both' */
  syncOn?: SyncTiming;
  /** Base path for URL (default: current path) */
  basePath?: string;
}

/**
 * Return type for useURLSync hook
 */
export interface UseURLSyncReturn<T> {
  /** Update URL with state */
  syncToURL: (state: T) => void;
  /** Read state from URL */
  readFromURL: () => Partial<T>;
  /** Current URL params */
  params: URLSearchParams;
}

/**
 * Bidirectional URL ↔ State synchronization hook
 * Handles the duplicated URL parsing logic across search/property pages
 *
 * @example
 * ```tsx
 * const { syncToURL, readFromURL } = useURLSync({
 *   serialize: (state) => ({
 *     destination: state.destination,
 *     checkIn: state.checkIn.toISOString(),
 *     checkOut: state.checkOut.toISOString(),
 *   }),
 *   deserialize: (params) => ({
 *     destination: params.get('destination') || '',
 *     checkIn: new Date(params.get('checkIn') || ''),
 *     checkOut: new Date(params.get('checkOut') || ''),
 *   }),
 *   syncOn: 'both',
 * });
 *
 * // Read from URL on mount
 * useEffect(() => {
 *   const urlState = readFromURL();
 *   setState(urlState);
 * }, []);
 *
 * // Sync to URL on state change
 * useEffect(() => {
 *   syncToURL(state);
 * }, [state]);
 * ```
 */
export function useURLSync<T extends Record<string, any>>({
  serialize,
  deserialize,
  syncOn = 'both',
  basePath,
}: UseURLSyncOptions<T> = {}): UseURLSyncReturn<T> {
  const router = useRouter();
  const searchParams = useSearchParams();

  const syncToURL = useCallback(
    (state: T) => {
      if (!serialize) return;

      const params = serialize(state);
      const urlParams = new URLSearchParams();

      // Add all non-empty params
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          urlParams.set(key, String(value));
        }
      });

      const path = basePath || window.location.pathname;
      const queryString = urlParams.toString();
      const newURL = queryString ? `${path}?${queryString}` : path;

      // Use replace to avoid adding to history on every change
      router.replace(newURL);
    },
    [router, serialize, basePath]
  );

  const readFromURL = useCallback((): Partial<T> => {
    if (!deserialize) return {};
    return deserialize(searchParams);
  }, [deserialize, searchParams]);

  return {
    syncToURL,
    readFromURL,
    params: searchParams,
  };
}

/**
 * Helper to create default serializers for common types
 */
export const createSerializers = {
  /** Serialize dates to ISO string */
  date: (date: Date | null | undefined): string => {
    if (!date) return '';
    try {
      return date.toISOString().split('T')[0];
    } catch {
      return '';
    }
  },

  /** Serialize number to string */
  number: (num: number | null | undefined): string => {
    if (num === null || num === undefined) return '';
    return String(num);
  },

  /** Serialize boolean to string */
  boolean: (bool: boolean | null | undefined): string => {
    if (bool === null || bool === undefined) return '';
    return bool ? 'true' : 'false';
  },
};

/**
 * Helper to create default deserializers for common types
 */
export const createDeserializers = {
  /** Deserialize ISO string to Date */
  date: (value: string | null): Date | null => {
    if (!value) return null;
    try {
      const date = new Date(value);
      return isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  },

  /** Deserialize string to number */
  number: (value: string | null, defaultValue = 0): number => {
    if (!value) return defaultValue;
    const num = parseInt(value, 10);
    return isNaN(num) ? defaultValue : num;
  },

  /** Deserialize string to boolean */
  boolean: (value: string | null, defaultValue = false): boolean => {
    if (!value) return defaultValue;
    return value === 'true';
  },
};
