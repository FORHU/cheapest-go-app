import { checkoutSchema, guestDetailsSchema } from '@/lib/schemas/checkout';
import type { CheckoutFormData, BookingForType } from '@/components/checkout/types';
import type { Guest } from '@/services/booking.service';

/**
 * Validate checkout form data using Zod schemas.
 * Returns either success or a record of field-level errors.
 */
export function validateCheckoutForm(
  formData: CheckoutFormData,
  bookingFor: BookingForType
): { success: true } | { success: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  const mainResult = checkoutSchema.safeParse({
    firstName: formData.firstName,
    lastName: formData.lastName,
    email: formData.email,
    phone: formData.phone,
    cardNumber: formData.cardNumber,
    expiry: formData.expiry,
    cvc: formData.cvc,
  });

  if (!mainResult.success) {
    for (const [field, msgs] of Object.entries(mainResult.error.flatten().fieldErrors)) {
      if (msgs?.[0]) errors[field] = msgs[0];
    }
  }

  if (bookingFor === 'someone_else') {
    const guestResult = guestDetailsSchema.safeParse({
      guestFirstName: formData.guestFirstName,
      guestLastName: formData.guestLastName,
    });
    if (!guestResult.success) {
      for (const [field, msgs] of Object.entries(guestResult.error.flatten().fieldErrors)) {
        if (msgs?.[0]) errors[field] = msgs[0];
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  return { success: true };
}

/**
 * Build the guest array payload for the booking API.
 */
export function buildGuestPayload(
  formData: CheckoutFormData,
  bookingFor: BookingForType,
  specialRequests?: string
): Guest[] {
  const primaryGuest: Guest = {
    occupancyNumber: 1,
    firstName: bookingFor === 'myself' ? formData.firstName : formData.guestFirstName,
    lastName: bookingFor === 'myself' ? formData.lastName : formData.guestLastName,
    email: formData.email,
  };

  if (specialRequests?.trim()) {
    primaryGuest.remarks = specialRequests.trim();
  }

  return [primaryGuest];
}

/**
 * Build the holder payload for the booking API.
 */
export function buildHolderPayload(formData: CheckoutFormData) {
  return {
    firstName: formData.firstName,
    lastName: formData.lastName,
    email: formData.email,
  };
}
