import { describe, it, expect } from 'vitest';
import {
    prebookSchema,
    guestSchema,
    holderSchema,
    bookingConfirmSchema,
    cancelBookingSchema,
    amendBookingSchema,
    saveBookingSchema,
    getBookingDetailsSchema,
} from './booking';

describe('Booking Schemas', () => {
    describe('prebookSchema', () => {
        it('should accept valid prebook input', () => {
            const valid = {
                offerId: 'ABC123',
                currency: 'USD',
            };

            expect(() => prebookSchema.parse(valid)).not.toThrow();
        });

        it('should accept optional voucher code', () => {
            const valid = {
                offerId: 'ABC123',
                currency: 'USD',
                voucherCode: 'SUMMER2026',
            };

            expect(() => prebookSchema.parse(valid)).not.toThrow();
        });

        it('should reject empty offer ID', () => {
            const invalid = {
                offerId: '',
                currency: 'USD',
            };

            expect(() => prebookSchema.parse(invalid)).toThrow('Offer ID is required');
        });

        it('should reject invalid currency length', () => {
            const invalid = {
                offerId: 'ABC123',
                currency: 'US', // Too short
            };

            expect(() => prebookSchema.parse(invalid)).toThrow('Currency must be 3 characters');
        });
    });

    describe('guestSchema', () => {
        it('should accept valid guest data', () => {
            const valid = {
                occupancyNumber: 1,
                firstName: 'John',
                lastName: 'Doe',
                email: 'john@example.com',
            };

            expect(() => guestSchema.parse(valid)).not.toThrow();
        });

        it('should accept optional remarks', () => {
            const valid = {
                occupancyNumber: 1,
                firstName: 'John',
                lastName: 'Doe',
                email: 'john@example.com',
                remarks: 'Late check-in',
            };

            expect(() => guestSchema.parse(valid)).not.toThrow();
        });

        it('should reject invalid email', () => {
            const invalid = {
                occupancyNumber: 1,
                firstName: 'John',
                lastName: 'Doe',
                email: 'not-an-email',
            };

            expect(() => guestSchema.parse(invalid)).toThrow('Valid email required');
        });

        it('should reject negative occupancy number', () => {
            const invalid = {
                occupancyNumber: -1,
                firstName: 'John',
                lastName: 'Doe',
                email: 'john@example.com',
            };

            expect(() => guestSchema.parse(invalid)).toThrow();
        });

        it('should reject zero occupancy number', () => {
            const invalid = {
                occupancyNumber: 0,
                firstName: 'John',
                lastName: 'Doe',
                email: 'john@example.com',
            };

            expect(() => guestSchema.parse(invalid)).toThrow();
        });

        it('should reject non-integer occupancy number', () => {
            const invalid = {
                occupancyNumber: 1.5,
                firstName: 'John',
                lastName: 'Doe',
                email: 'john@example.com',
            };

            expect(() => guestSchema.parse(invalid)).toThrow();
        });
    });

    describe('holderSchema', () => {
        it('should accept valid holder data', () => {
            const valid = {
                firstName: 'Jane',
                lastName: 'Smith',
                email: 'jane@example.com',
            };

            expect(() => holderSchema.parse(valid)).not.toThrow();
        });

        it('should reject empty first name', () => {
            const invalid = {
                firstName: '',
                lastName: 'Smith',
                email: 'jane@example.com',
            };

            expect(() => holderSchema.parse(invalid)).toThrow('First name is required');
        });
    });

    describe('bookingConfirmSchema', () => {
        const validBooking = {
            prebookId: 'PRE123',
            holder: {
                firstName: 'Jane',
                lastName: 'Smith',
                email: 'jane@example.com',
            },
            guests: [
                {
                    occupancyNumber: 1,
                    firstName: 'John',
                    lastName: 'Doe',
                    email: 'john@example.com',
                },
            ],
            payment: {
                method: 'stripe',
            },
        };

        it('should accept valid booking confirmation', () => {
            expect(() => bookingConfirmSchema.parse(validBooking)).not.toThrow();
        });

        it('should accept multiple guests', () => {
            const multiGuest = {
                ...validBooking,
                guests: [
                    {
                        occupancyNumber: 1,
                        firstName: 'John',
                        lastName: 'Doe',
                        email: 'john@example.com',
                    },
                    {
                        occupancyNumber: 2,
                        firstName: 'Jane',
                        lastName: 'Doe',
                        email: 'jane@example.com',
                    },
                ],
            };

            expect(() => bookingConfirmSchema.parse(multiGuest)).not.toThrow();
        });

        it('should reject empty guests array', () => {
            const invalid = {
                ...validBooking,
                guests: [],
            };

            expect(() => bookingConfirmSchema.parse(invalid)).toThrow('At least one guest is required');
        });

        it('should reject missing prebook ID', () => {
            const invalid = {
                ...validBooking,
                prebookId: '',
            };

            expect(() => bookingConfirmSchema.parse(invalid)).toThrow('Prebook ID is required');
        });
    });

    describe('cancelBookingSchema', () => {
        it('should accept valid booking ID', () => {
            const valid = {
                bookingId: 'BK123456',
            };

            expect(() => cancelBookingSchema.parse(valid)).not.toThrow();
        });

        it('should reject empty booking ID', () => {
            const invalid = {
                bookingId: '',
            };

            expect(() => cancelBookingSchema.parse(invalid)).toThrow('Booking ID is required');
        });
    });

    describe('amendBookingSchema', () => {
        const validAmendment = {
            bookingId: 'BK123456',
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
        };

        it('should accept valid amendment data', () => {
            expect(() => amendBookingSchema.parse(validAmendment)).not.toThrow();
        });

        it('should accept optional remarks', () => {
            const withRemarks = {
                ...validAmendment,
                remarks: 'Changed room preference',
            };

            expect(() => amendBookingSchema.parse(withRemarks)).not.toThrow();
        });

        it('should reject invalid email', () => {
            const invalid = {
                ...validAmendment,
                email: 'invalid-email',
            };

            expect(() => amendBookingSchema.parse(invalid)).toThrow('Valid email required');
        });
    });

    describe('saveBookingSchema', () => {
        const validSave = {
            bookingId: 'BK123456',
            propertyName: 'Grand Hotel',
            roomName: 'Deluxe Suite',
            checkIn: '2026-05-01',
            checkOut: '2026-05-05',
            adults: 2,
            children: 1,
            totalPrice: 500.00,
            currency: 'USD',
            holderFirstName: 'Jane',
            holderLastName: 'Smith',
            holderEmail: 'jane@example.com',
        };

        it('should accept valid save booking data', () => {
            expect(() => saveBookingSchema.parse(validSave)).not.toThrow();
        });

        it('should accept optional property image and special requests', () => {
            const withOptionals = {
                ...validSave,
                propertyImage: 'https://example.com/hotel.jpg',
                specialRequests: 'Non-smoking room',
            };

            expect(() => saveBookingSchema.parse(withOptionals)).not.toThrow();
        });

        it('should reject invalid currency length', () => {
            const invalid = {
                ...validSave,
                currency: 'US',
            };

            expect(() => saveBookingSchema.parse(invalid)).toThrow('Currency must be 3 characters');
        });

        it('should reject zero or negative adults', () => {
            const invalid = {
                ...validSave,
                adults: 0,
            };

            expect(() => saveBookingSchema.parse(invalid)).toThrow('At least 1 adult required');
        });

        it('should reject negative children', () => {
            const invalid = {
                ...validSave,
                children: -1,
            };

            expect(() => saveBookingSchema.parse(invalid)).toThrow();
        });

        it('should reject zero or negative total price', () => {
            const invalid = {
                ...validSave,
                totalPrice: 0,
            };

            expect(() => saveBookingSchema.parse(invalid)).toThrow('Total price must be positive');
        });

        it('should reject non-integer children count', () => {
            const invalid = {
                ...validSave,
                children: 1.5,
            };

            expect(() => saveBookingSchema.parse(invalid)).toThrow();
        });

        it('should reject invalid property image URL', () => {
            const invalid = {
                ...validSave,
                propertyImage: 'not-a-url',
            };

            expect(() => saveBookingSchema.parse(invalid)).toThrow();
        });
    });

    describe('getBookingDetailsSchema', () => {
        it('should accept valid booking ID', () => {
            const valid = {
                bookingId: 'BK123456',
            };

            expect(() => getBookingDetailsSchema.parse(valid)).not.toThrow();
        });

        it('should reject empty booking ID', () => {
            const invalid = {
                bookingId: '',
            };

            expect(() => getBookingDetailsSchema.parse(invalid)).toThrow('Booking ID is required');
        });
    });
});
