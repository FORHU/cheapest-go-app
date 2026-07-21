/**
 * The Terms & Conditions / Privacy Policy acceptance checkbox exists only on
 * account creation (signup), never on sign-in. Sign-in must not be gated by it.
 */
import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const hoisted = vi.hoisted(() => ({
    state: { mode: 'signup' as 'signin' | 'signup' },
    register: vi.fn().mockResolvedValue(undefined),
    login: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock('@/components/auth/SocialLoginButtons', () => ({ default: () => null }));
vi.mock('@/components/auth/VerifyEmailStep', () => ({ default: () => null }));
vi.mock('@/components/auth/ForgotPasswordStep', () => ({ default: () => null }));
vi.mock('@/components/ui/GlobalSparkle', () => ({ GlobalSparkle: () => null }));

vi.mock('@/hooks', () => ({
    useLoginForm: () => {
        const [password, setPassword] = useState('');
        const [errors, setErrors] = useState<Record<string, string>>({});
        return {
            isLoading: false,
            authStep: 'password',
            setAuthStep: vi.fn(),
            register: hoisted.register,
            login: hoisted.login,
            mode: hoisted.state.mode,
            setMode: vi.fn(),
            email: 'returning.user@example.com',
            setEmail: vi.fn(),
            firstName: 'Ada',
            setFirstName: vi.fn(),
            lastName: 'Lovelace',
            setLastName: vi.fn(),
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

import { NextIntlClientProvider } from 'next-intl';
import { LoginContent } from '@/components/login/LoginContent';
import messages from '@/locales/en.json';

const PASSWORD = '2-9-12-12-25-Bb';

/** The auth form reads its copy from next-intl; assertions below use the en strings. */
function Wrapper({ children }: { children: React.ReactNode }) {
    return (
        <NextIntlClientProvider locale="en" messages={messages}>
            {children}
        </NextIntlClientProvider>
    );
}

describe('Terms acceptance is scoped to account creation', () => {
    beforeEach(() => {
        hoisted.register.mockClear();
        hoisted.login.mockClear();
    });

    it('shows the terms checkbox and gates the button on signup', () => {
        hoisted.state.mode = 'signup';
        render(<LoginContent />, { wrapper: Wrapper });

        expect(screen.getByRole('checkbox')).toBeInTheDocument();
        expect(screen.getByText('Terms & Conditions')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^create account$/i })).toBeDisabled();
    });

    it('has no terms checkbox on sign-in and does not gate sign-in', async () => {
        hoisted.state.mode = 'signin';
        render(<LoginContent />, { wrapper: Wrapper });

        // No acceptance UI at all.
        expect(screen.queryByRole('checkbox')).toBeNull();
        expect(screen.queryByText('Terms & Conditions')).toBeNull();
        expect(screen.queryByText('Privacy Policy')).toBeNull();

        // The Sign in button is not gated.
        const signInBtn = screen.getByRole('button', { name: /^sign in$/i });
        expect(signInBtn).toBeEnabled();

        fireEvent.change(screen.getByPlaceholderText('Enter your password'), {
            target: { value: PASSWORD },
        });
        fireEvent.click(signInBtn);

        await waitFor(() => expect(hoisted.login).toHaveBeenCalledTimes(1));
        expect(screen.queryByText(/accept the terms/i)).toBeNull();
    });
});
