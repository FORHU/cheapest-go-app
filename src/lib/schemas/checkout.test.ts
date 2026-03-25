import { describe, it, expect } from 'vitest';
import {
    userDetailsSchema,
    guestDetailsSchema,
    paymentSchema,
    checkoutSchema,
} from './checkout';

describe('Checkout Schemas', () => {
    describe('userDetailsSchema', () => {
        const validUser = {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
        };

        it('should accept valid user details', () => {
            expect(() => userDetailsSchema.parse(validUser)).not.toThrow();
        });

        it('should accept optional phone', () => {
            const withPhone = {
                ...validUser,
                phone: '+1234567890',
            };

            expect(() => userDetailsSchema.parse(withPhone)).not.toThrow();
        });

        it('should reject empty first name', () => {
            const invalid = {
                ...validUser,
                firstName: '',
            };

            expect(() => userDetailsSchema.parse(invalid)).toThrow('First name is required');
        });

        it('should reject empty email', () => {
            const invalid = {
                ...validUser,
                email: '',
            };

            expect(() => userDetailsSchema.parse(invalid)).toThrow('Email is required');
        });

        it('should reject invalid email format', () => {
            const invalid = {
                ...validUser,
                email: 'not-an-email',
            };

            expect(() => userDetailsSchema.parse(invalid)).toThrow('Please enter a valid email');
        });

        it('should accept various valid email formats', () => {
            const emails = [
                'simple@example.com',
                'user.name@example.com',
                'user+tag@example.co.uk',
                'user_123@sub.example.com',
            ];

            emails.forEach(email => {
                const user = { ...validUser, email };
                expect(() => userDetailsSchema.parse(user)).not.toThrow();
            });
        });
    });

    describe('guestDetailsSchema', () => {
        it('should accept valid guest details', () => {
            const valid = {
                guestFirstName: 'Jane',
                guestLastName: 'Smith',
            };

            expect(() => guestDetailsSchema.parse(valid)).not.toThrow();
        });

        it('should reject empty guest first name', () => {
            const invalid = {
                guestFirstName: '',
                guestLastName: 'Smith',
            };

            expect(() => guestDetailsSchema.parse(invalid)).toThrow('Guest first name is required');
        });

        it('should reject empty guest last name', () => {
            const invalid = {
                guestFirstName: 'Jane',
                guestLastName: '',
            };

            expect(() => guestDetailsSchema.parse(invalid)).toThrow('Guest last name is required');
        });
    });

    describe('paymentSchema', () => {
        const validPayment = {
            cardNumber: '4242 4242 4242 4242',
            expiry: '12/26',
            cvc: '123',
        };

        it('should accept valid payment details', () => {
            expect(() => paymentSchema.parse(validPayment)).not.toThrow();
        });

        it('should accept card numbers without spaces', () => {
            const noSpaces = {
                ...validPayment,
                cardNumber: '4242424242424242',
            };

            expect(() => paymentSchema.parse(noSpaces)).not.toThrow();
        });

        it('should accept various card number lengths (13-19 digits)', () => {
            const cardNumbers = [
                '1234567890123',     // 13 digits (minimum)
                '1234567890123456',  // 16 digits (typical)
                '1234567890123456789', // 19 digits (maximum)
            ];

            cardNumbers.forEach(cardNumber => {
                const payment = { ...validPayment, cardNumber };
                expect(() => paymentSchema.parse(payment)).not.toThrow();
            });
        });

        it('should accept expiry with or without spaces', () => {
            const formats = ['12/26', '12 / 26', '01/30'];

            formats.forEach(expiry => {
                const payment = { ...validPayment, expiry };
                expect(() => paymentSchema.parse(payment)).not.toThrow();
            });
        });

        it('should accept 3 or 4 digit CVC', () => {
            const cvcs = ['123', '1234'];

            cvcs.forEach(cvc => {
                const payment = { ...validPayment, cvc };
                expect(() => paymentSchema.parse(payment)).not.toThrow();
            });
        });

        it('should reject empty card number', () => {
            const invalid = {
                ...validPayment,
                cardNumber: '',
            };

            expect(() => paymentSchema.parse(invalid)).toThrow('Card number is required');
        });

        it('should reject card number too short', () => {
            const invalid = {
                ...validPayment,
                cardNumber: '123456789012', // 12 digits (too short)
            };

            expect(() => paymentSchema.parse(invalid)).toThrow('Enter a valid card number');
        });

        it('should reject card number too long', () => {
            const invalid = {
                ...validPayment,
                cardNumber: '12345678901234567890', // 20 digits (too long)
            };

            expect(() => paymentSchema.parse(invalid)).toThrow('Enter a valid card number');
        });

        it('should reject card number with letters', () => {
            const invalid = {
                ...validPayment,
                cardNumber: '4242 ABCD 4242 4242',
            };

            expect(() => paymentSchema.parse(invalid)).toThrow('Enter a valid card number');
        });

        it('should reject invalid expiry format', () => {
            const invalidFormats = [
                '13/26',  // Invalid month (13)
                '00/26',  // Invalid month (0)
                '12/6',   // Single digit year
                '1/26',   // Single digit month
                '12-26',  // Wrong separator
                '12/2026', // 4-digit year
            ];

            invalidFormats.forEach(expiry => {
                const invalid = { ...validPayment, expiry };
                expect(() => paymentSchema.parse(invalid)).toThrow('Use MM/YY format');
            });
        });

        it('should reject invalid CVC', () => {
            const invalidCvcs = [
                '12',     // Too short
                '12345',  // Too long
                'ABC',    // Letters
                '12A',    // Mixed
            ];

            invalidCvcs.forEach(cvc => {
                const invalid = { ...validPayment, cvc };
                expect(() => paymentSchema.parse(invalid)).toThrow('Enter a valid CVC');
            });
        });
    });

    describe('checkoutSchema', () => {
        const validCheckout = {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
            cardNumber: '4242 4242 4242 4242',
            expiry: '12/26',
            cvc: '123',
        };

        it('should accept valid checkout data', () => {
            expect(() => checkoutSchema.parse(validCheckout)).not.toThrow();
        });

        it('should accept optional phone', () => {
            const withPhone = {
                ...validCheckout,
                phone: '+1234567890',
            };

            expect(() => checkoutSchema.parse(withPhone)).not.toThrow();
        });

        it('should validate both user details and payment', () => {
            const invalidEmail = {
                ...validCheckout,
                email: 'invalid',
            };

            expect(() => checkoutSchema.parse(invalidEmail)).toThrow('Please enter a valid email');

            const invalidCard = {
                ...validCheckout,
                cardNumber: '123',
            };

            expect(() => checkoutSchema.parse(invalidCard)).toThrow('Enter a valid card number');
        });

        it('should reject missing required fields', () => {
            const missingFields = [
                { ...validCheckout, firstName: undefined },
                { ...validCheckout, lastName: undefined },
                { ...validCheckout, email: undefined },
                { ...validCheckout, cardNumber: undefined },
                { ...validCheckout, expiry: undefined },
                { ...validCheckout, cvc: undefined },
            ];

            missingFields.forEach(data => {
                expect(() => checkoutSchema.parse(data)).toThrow();
            });
        });
    });

    describe('Edge Cases', () => {
        it('should handle unicode characters in names', () => {
            const unicodeNames = {
                firstName: 'François',
                lastName: 'Müller',
                email: 'francois@example.com',
            };

            expect(() => userDetailsSchema.parse(unicodeNames)).not.toThrow();
        });

        it('should handle very long names', () => {
            const longNames = {
                firstName: 'A'.repeat(100),
                lastName: 'B'.repeat(100),
                email: 'test@example.com',
            };

            expect(() => userDetailsSchema.parse(longNames)).not.toThrow();
        });

        it('should handle international phone formats', () => {
            const phones = [
                '+1234567890',
                '+44 20 1234 5678',
                '001 234 567 8900',
                '(123) 456-7890',
            ];

            phones.forEach(phone => {
                const user = {
                    firstName: 'John',
                    lastName: 'Doe',
                    email: 'john@example.com',
                    phone,
                };
                expect(() => userDetailsSchema.parse(user)).not.toThrow();
            });
        });
    });
});
