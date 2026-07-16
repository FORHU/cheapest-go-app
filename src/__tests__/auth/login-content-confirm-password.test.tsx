/**
 * Regression: the signup form reported "Passwords do not match" even when the
 * two fields were identical.
 *
 * handleSubmit is a useCallback whose dependency array listed `password` but
 * not `confirmPassword`. Typing the password rebuilt the callback (capturing
 * the then-empty confirmPassword); typing the confirmation did not. On submit
 * the callback still compared against the stale empty string.
 *
 * The test types the fields in the order a real user does — password first,
 * then confirmation — which is what triggers the stale capture.
 */
import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// These identities must be STABLE across renders. The real hook's actions come
// from a zustand store and are stable; if the mock recreated them each render
// the dependency array would change every render, useCallback would rebuild,
// and the stale closure under test would be masked.
const register = vi.fn().mockResolvedValue(undefined);
const login = vi.fn().mockResolvedValue(undefined);
const setAuthStep = vi.fn();
const setMode = vi.fn();

vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/components/auth/SocialLoginButtons', () => ({ default: () => null }));
vi.mock('@/components/auth/VerifyEmailStep', () => ({ default: () => null }));
vi.mock('@/components/auth/ForgotPasswordStep', () => ({ default: () => null }));
vi.mock('@/components/ui/GlobalSparkle', () => ({ GlobalSparkle: () => null }));

// Drive the real form state the way the real hook does, so the component's
// useCallback closure behaviour is exercised faithfully.
vi.mock('@/hooks', () => ({
    useLoginForm: () => {
        const [password, setPassword] = useState('');
        const [email, setEmail] = useState('new.user@example.com');
        const [firstName, setFirstName] = useState('Ada');
        const [lastName, setLastName] = useState('Lovelace');
        const [errors, setErrors] = useState<Record<string, string>>({});
        return {
            isLoading: false,
            authStep: 'password',
            setAuthStep,
            register,
            login,
            mode: 'signup',
            setMode,
            email,
            setEmail,
            firstName,
            setFirstName,
            lastName,
            setLastName,
            password,
            setPassword,
            errors,
            setErrors,
            clearError: (field: string) => () =>
                setErrors((prev) => {
                    const next = { ...prev };
                    delete next[field];
                    return next;
                }),
        };
    },
}));

import { LoginContent } from '@/components/login/LoginContent';

const PASSWORD = '2-9-12-12-25-Bb';

describe('LoginContent — signup password confirmation', () => {
    beforeEach(() => {
        register.mockClear();
        login.mockClear();
    });

    it('accepts matching passwords typed in password-then-confirm order', async () => {
        render(<LoginContent />);

        const passwordBoxes = screen.getAllByPlaceholderText(/password/i);
        const passwordInput = screen.getByPlaceholderText('Create a password');
        const confirmInput = screen.getByPlaceholderText('Re-enter your password');
        expect(passwordBoxes.length).toBeGreaterThanOrEqual(2);

        // The order that triggered the stale closure.
        fireEvent.change(passwordInput, { target: { value: PASSWORD } });
        fireEvent.change(confirmInput, { target: { value: PASSWORD } });

        fireEvent.click(screen.getByRole('button', { name: /^create account$/i }));

        await waitFor(() => expect(register).toHaveBeenCalledTimes(1));
        expect(screen.queryByText(/passwords do not match/i)).toBeNull();
    });

    it('still rejects genuinely mismatched passwords', async () => {
        render(<LoginContent />);

        fireEvent.change(screen.getByPlaceholderText('Create a password'), {
            target: { value: PASSWORD },
        });
        fireEvent.change(screen.getByPlaceholderText('Re-enter your password'), {
            target: { value: 'something-else' },
        });

        fireEvent.click(screen.getByRole('button', { name: /^create account$/i }));

        expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
        expect(register).not.toHaveBeenCalled();
    });
});
