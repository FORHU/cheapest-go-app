/**
 * Shared types for checkout components
 */

export interface CheckoutFormData {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    guestFirstName: string;
    guestLastName: string;
    cardNumber: string;
    expiry: string;
    cvc: string;
    cardCountry: string;
    cardAddress: string;
    cardCity: string;
    cardZip: string;
}

export type BookingForType = 'myself' | 'someone_else';
