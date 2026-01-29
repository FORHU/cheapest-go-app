// Auth & Supabase hooks
export { useSupabase } from './useSupabase';
export { useAuthForm } from './useAuthForm';

// UI utility hooks
export { useDisclosure } from './useDisclosure';
export { useClickOutside } from './useClickOutside';
export { useKeyPress } from './useKeyPress';
export { useHorizontalScroll } from './useHorizontalScroll';

// Search hooks
export { useSearchModule } from './useSearchModule';

// State management hooks (Phase 1)
export { useAsyncOperation } from './useAsyncOperation';
export type { UseAsyncOperationOptions, UseAsyncOperationReturn } from './useAsyncOperation';
export { useFormState } from './useFormState';
export type { FormErrors, FormTouched, UseFormStateOptions, UseFormStateReturn } from './useFormState';
export { useURLSync, createSerializers, createDeserializers } from './useURLSync';
export type { SerializeFn, DeserializeFn, SyncTiming, UseURLSyncOptions, UseURLSyncReturn } from './useURLSync';

// React Query mutation hooks (Phase 3)
export { usePrebook, useBooking } from './mutations';
export type { UsePrebookOptions } from './mutations/usePrebook';
export type { UseBookingOptions } from './mutations/useBooking';

// High-level booking flow hook (Phase 3)
export { useBookingFlow } from './useBookingFlow';
export type { PriceData, UseBookingFlowReturn } from './useBookingFlow';

// Utility hooks (Phase 5)
export { usePagination } from './usePagination';
export type { UsePaginationOptions, UsePaginationReturn } from './usePagination';

