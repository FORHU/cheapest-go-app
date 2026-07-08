import { userDetailsSchema } from '@/lib/schemas/checkout';
import type { CheckoutFormData } from '@/components/checkout/types';
import type { Guest } from '@/services/booking.service';

/**
 * Validate checkout form data using Zod schemas.
 * Returns either success or a record of field-level errors.
 */
export function validateCheckoutForm(
  formData: CheckoutFormData
): { success: true } | { success: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  const mainResult = userDetailsSchema.safeParse({
    firstName: formData.firstName,
    lastName: formData.lastName,
    email: formData.email,
    phone: formData.phone,
  });

  if (!mainResult.success) {
    for (const [field, msgs] of Object.entries(mainResult.error.flatten().fieldErrors)) {
      if (msgs?.[0]) errors[field] = msgs[0];
    }
  }

  const additionalGuests = formData.additionalGuests ?? [];
  for (let i = 0; i < additionalGuests.length; i++) {
    const g = additionalGuests[i];
    if (!g.firstName?.trim()) errors[`guest_${i}_firstName`] = 'First name is required';
    if (!g.lastName?.trim()) errors[`guest_${i}_lastName`] = 'Last name is required';
  }

  const childGuests = formData.childGuests ?? [];
  for (let i = 0; i < childGuests.length; i++) {
    const c = childGuests[i];
    if (!c.firstName?.trim()) errors[`child_${i}_firstName`] = 'First name is required';
    if (!c.lastName?.trim()) errors[`child_${i}_lastName`] = 'Last name is required';
    const age = parseInt(c.age, 10);
    if (c.age === '' || isNaN(age) || age < 0 || age > 17) errors[`child_${i}_age`] = 'Enter a valid age (0–17)';
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
  specialRequests?: string
): Guest[] {
  const guests: Guest[] = [
    {
      occupancyNumber: 1,
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      ...(specialRequests?.trim() ? { remarks: specialRequests.trim() } : {}),
    },
  ];

  const additionalGuests = formData.additionalGuests ?? [];
  for (let i = 0; i < additionalGuests.length; i++) {
    const g = additionalGuests[i];
    if (g.firstName || g.lastName) {
      guests.push({
        occupancyNumber: i + 2,
        firstName: g.firstName,
        lastName: g.lastName,
        email: formData.email,
      });
    }
  }

  const adultCount = 1 + additionalGuests.length;
  const childGuests = formData.childGuests ?? [];
  for (let i = 0; i < childGuests.length; i++) {
    const c = childGuests[i];
    if (c.firstName || c.lastName) {
      guests.push({
        occupancyNumber: adultCount + i + 1,
        firstName: c.firstName,
        lastName: c.lastName,
        email: formData.email,
        age: parseInt(c.age, 10) || 10,
      });
    }
  }

  return guests;
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
