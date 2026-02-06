import type {
  PrebookInput,
  BookingConfirmInput,
  AmendBookingInput,
  SaveBookingInput,
} from '@/lib/schemas';

// Re-export input types for hooks and services
export type PrebookParams = PrebookInput;
export type BookingParams = BookingConfirmInput;
export type AmendBookingParams = AmendBookingInput;
export type SaveBookingParams = SaveBookingInput;

// Result Types
export interface PrebookResult {
  success: boolean;
  data?: {
    prebookId: string;
    price?: {
      subtotal?: number;
      taxes?: number;
      total: number;
    };
    status?: string;
    cancellationPolicies?: CancellationPolicy;
  };
  error?: string;
}

export interface BookingResult {
  success: boolean;
  data?: {
    bookingId: string;
    status: string;
    confirmationNumber?: string;
  };
  error?: string;
}

export interface CancelBookingResult {
  success: boolean;
  data?: {
    bookingId: string;
    status: string;
    cancellationId?: string;
    refund?: {
      amount: number;
      currency: string;
    };
  };
  error?: string;
}

export interface AmendBookingResult {
  success: boolean;
  data?: {
    bookingId: string;
    status: string;
  };
  error?: string;
}

export interface CancellationPolicy {
  cancelPolicyInfos?: Array<{
    cancelTime: string;
    amount: number;
    currency: string;
    type: string;
  }>;
  hotelRemarks?: string[];
  refundableTag?: string;
}

export interface BookingDetailsResult {
  success: boolean;
  data?: {
    bookingId: string;
    status: string;
    hotel: {
      name: string;
      hotelId: string;
    };
    bookedRooms: Array<{
      roomType: string;
      adults: number;
      children: number;
      rate: {
        retailRate: {
          total: { amount: number; currency: string };
        };
      };
    }>;
    guestInfo: {
      guestFirstName: string;
      guestLastName: string;
      guestEmail: string;
    };
    checkin: string;
    checkout: string;
    cancellationPolicies?: CancellationPolicy;
    cancellation?: {
      cancelAllowed: boolean;
      fee?: { amount: number; currency: string };
      refund?: { amount: number; currency: string };
    };
  };
  error?: string;
}
