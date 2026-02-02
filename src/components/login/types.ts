/**
 * Shared types for login/auth components
 */

export type AuthMode = 'signin' | 'signup';

export interface LoginFormData {
    email: string;
    firstName: string;
    lastName: string;
    password: string;
}

export interface PasswordRequirement {
    label: string;
    met: boolean;
}
