import { useState, useCallback } from 'react';

/**
 * Options for configuring async operation behavior
 */
export interface UseAsyncOperationOptions<T> {
  /** Callback executed when operation succeeds */
  onSuccess?: (data: T) => void;
  /** Callback executed when operation fails */
  onError?: (error: Error) => void;
  /** Initial data value */
  initialData?: T;
}

/**
 * Return type for useAsyncOperation hook
 */
export interface UseAsyncOperationReturn<T, P extends any[]> {
  /** The data returned from the async operation */
  data: T | null;
  /** Error object if operation failed */
  error: Error | null;
  /** Whether the operation is currently in progress */
  isLoading: boolean;
  /** Whether the operation completed successfully */
  isSuccess: boolean;
  /** Whether the operation failed */
  isError: boolean;
  /** Execute the async operation */
  execute: (...args: P) => Promise<T>;
  /** Reset the operation state */
  reset: () => void;
}

/**
 * Generic async operation state management hook
 * Replaces repetitive useState + useEffect patterns for async operations
 *
 * @example
 * ```tsx
 * const { data, isLoading, error, execute } = useAsyncOperation(
 *   async (userId: string) => {
 *     const response = await fetch(`/api/users/${userId}`);
 *     return response.json();
 *   },
 *   {
 *     onSuccess: (data) => console.log('User loaded:', data),
 *     onError: (error) => console.error('Failed to load user:', error),
 *   }
 * );
 *
 * // Execute the operation
 * await execute('user-123');
 * ```
 */
export function useAsyncOperation<T, P extends any[]>(
  asyncFn: (...args: P) => Promise<T>,
  options: UseAsyncOperationOptions<T> = {}
): UseAsyncOperationReturn<T, P> {
  const { onSuccess, onError, initialData = null } = options;

  const [data, setData] = useState<T | null>(initialData);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isError, setIsError] = useState(false);

  const execute = useCallback(
    async (...args: P): Promise<T> => {
      setIsLoading(true);
      setError(null);
      setIsSuccess(false);
      setIsError(false);

      try {
        const result = await asyncFn(...args);
        setData(result);
        setIsSuccess(true);
        onSuccess?.(result);
        return result;
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        setError(errorObj);
        setIsError(true);
        onError?.(errorObj);
        throw errorObj;
      } finally {
        setIsLoading(false);
      }
    },
    [asyncFn, onSuccess, onError]
  );

  const reset = useCallback(() => {
    setData(initialData);
    setError(null);
    setIsLoading(false);
    setIsSuccess(false);
    setIsError(false);
  }, [initialData]);

  return {
    data,
    error,
    isLoading,
    isSuccess,
    isError,
    execute,
    reset,
  };
}
