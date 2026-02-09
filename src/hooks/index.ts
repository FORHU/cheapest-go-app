export { useSupabase, useAuthForm, useAuthRedirect, usePasswordValidation, useLoginForm } from './auth';
export type { PasswordRequirement, AuthMode } from './auth';

// UI utility hooks (used across multiple pages)
export { useDisclosure, useClickOutside, useKeyPress, useHorizontalScroll } from './ui';

// Form & state management hooks
export { useAsyncOperation, useFormState, useURLSync, createSerializers, createDeserializers, usePagination } from './form';
export type { UseAsyncOperationOptions, UseAsyncOperationReturn } from './form';
export type { FormErrors, FormTouched, UseFormStateOptions, UseFormStateReturn } from './form';
export type { SerializeFn, DeserializeFn, SyncTiming, UseURLSyncOptions, UseURLSyncReturn } from './form';
export type { UsePaginationOptions, UsePaginationReturn } from './form';

// Search page hooks
export { useSearchModule } from './search';

// Booking hooks (checkout, property pages)
export { useBookingFlow } from './booking';
export type { PriceData, UseBookingFlowReturn } from './booking';

// React Query mutation hooks
export { usePrebook, useBooking } from './mutations';
export type { UsePrebookOptions } from './mutations/usePrebook';
export type { UseBookingOptions } from './mutations/useBooking';

// Trips page hooks

// Checkout hooks
export { useCheckoutForm, useCheckoutPrebook, usePricingCalculation } from './checkout';

// Room hooks (property page)
export { useRoomGrouping } from './room';
export type { UseRoomGroupingOptions, UseRoomGroupingReturn } from './room';
