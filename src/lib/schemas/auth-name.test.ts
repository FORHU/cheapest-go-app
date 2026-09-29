import { describe, it, expect } from 'vitest';
import { profileSchema, registerSchema, NAME_MAX_LENGTH } from './auth';

/**
 * QA BG-9: nothing capped a person's name. A profile on live holds a 13,708-character first
 * name, which renders as a wall of text wherever the account is shown.
 */

const validRegistration = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.test',
    password: 'Password1',
    birthDate: '1990-05-04',
};

describe('a person\'s name is at most 30 characters', () => {
    it('caps at 30', () => {
        expect(NAME_MAX_LENGTH).toBe(30);
        expect(profileSchema.safeParse({ firstName: 'a'.repeat(30), lastName: 'Cruz' }).success).toBe(true);
        expect(profileSchema.safeParse({ firstName: 'a'.repeat(31), lastName: 'Cruz' }).success).toBe(false);
    });

    it('says what is wrong, in words a toast can show', () => {
        const result = profileSchema.safeParse({ firstName: 'Lorem ipsum dolor sit amet, consectetuer adipiscing elit.', lastName: 'Cruz' });
        expect(result.success).toBe(false);
        expect(result.error!.issues[0].message).toBe('First name must be 30 characters or fewer');
    });

    it('names the field that is too long', () => {
        const result = profileSchema.safeParse({ firstName: 'Ada', lastName: 'b'.repeat(31) });
        expect(result.error!.issues[0].message).toBe('Last name must be 30 characters or fewer');
    });

    it('still requires a name, and trims what it keeps', () => {
        expect(profileSchema.safeParse({ firstName: '   ', lastName: 'Cruz' }).success).toBe(false);
        expect(profileSchema.parse({ firstName: '  Ada  ', lastName: 'Cruz' }).firstName).toBe('Ada');
    });

    it('holds long real names', () => {
        // 28 characters.
        expect(profileSchema.safeParse({ firstName: 'Maria Jose Consolacion', lastName: 'Dela Cruz-Villanueva' }).success).toBe(true);
    });

    it('applies at sign-up too', () => {
        expect(registerSchema.safeParse(validRegistration).success).toBe(true);
        expect(registerSchema.safeParse({ ...validRegistration, firstName: 'a'.repeat(31) }).success).toBe(false);
    });
});
