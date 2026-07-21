'use client';

import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { usePasswordValidation } from '@/hooks/auth';
import type { AuthStep } from '@/types/auth';

export type AuthMode = 'signin' | 'signup';

interface UseLoginFormReturn {
    // Auth store values
    isLoading: boolean;
    authStep: AuthStep;
    setAuthStep: (step: AuthStep) => void;
    user: any;
    register: (data: { email: string; password: string; firstName: string; lastName: string }) => Promise<void>;
    login: (email: string, password: string) => Promise<void>;

    // Form state
    mode: AuthMode;
    setMode: (mode: AuthMode) => void;
    email: string;
    setEmail: (email: string) => void;
    firstName: string;
    setFirstName: (name: string) => void;
    lastName: string;
    setLastName: (name: string) => void;
    password: string;
    setPassword: (password: string) => void;
    errors: Record<string, string>;
    setErrors: (errors: Record<string, string>) => void;

    // Password validation
    passwordRequirements: { label: string; met: boolean }[];
    allRequirementsMet: boolean;

    // Helpers
    validateEmail: (email: string) => boolean;
}

interface UseLoginFormOptions {
    isAdminMode?: boolean;
}

/**
 * Hook to manage all login/signup form state and logic.
 * Handles auth redirects, mode syncing, and form validation.
 */
export function useLoginForm(options: UseLoginFormOptions = {}): UseLoginFormReturn {
    const { isAdminMode = false } = options;
    const { register, login, logout, isLoading, authStep, setAuthStep, user } = useAuthStore();
    const searchParams = useSearchParams();
    const router = useRouter();

    // Compute initial mode from URL
    const initialMode = useMemo((): AuthMode => {
        if (isAdminMode) return 'signin';
        const urlMode = searchParams?.get('mode');
        return urlMode === 'signup' ? 'signup' : 'signin';
    }, [searchParams, isAdminMode]);

    // Form state
    const [mode, setMode] = useState<AuthMode>(initialMode);
    const [email, setEmail] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [password, setPassword] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});

    // Refs for tracking changes
    const prevUserRef = useRef(user);
    const prevAuthStepRef = useRef(authStep);
    const hasSetInitialAuthStep = useRef(false);

    // Redirect when user is authenticated
    useEffect(() => {
        if (user) {
            // Admin mode redirection logic
            if (isAdminMode) {
                if (user.role === 'admin') {
                    router.push('/admin/overview');
                } else {
                    // Not an admin, sign out
                    const logoutAndError = async () => {
                        await logout();
                        setErrors({ general: 'Access Denied: You do not have administrative privileges.' });
                    };
                    logoutAndError();
                }
                return;
            }

            // Normal user mode redirection logic
            if (user.role === 'admin') {
                router.push('/admin/overview');
                return;
            }

            // Standard redirect for non-admins navigating to login
            if (!prevUserRef.current) {
                const redirectTo = searchParams?.get('redirect') || '/';
                router.push(redirectTo);
            }
        }
        prevUserRef.current = user;
    }, [user, searchParams, router, setErrors, isAdminMode, logout]);

    // Sync mode with authStep changes
    useEffect(() => {
        if (authStep !== prevAuthStepRef.current) {
            if (authStep === 'password' || authStep === 'email') {
                if (mode !== 'signin') setMode('signin');
            } else if (authStep === 'register') {
                if (mode !== 'signup') setMode('signup');
            }
        }
        prevAuthStepRef.current = authStep;
    }, [authStep, mode]);

    // Lock mode to signin for admin
    useEffect(() => {
        if (isAdminMode && mode !== 'signin') {
            setMode('signin');
        }
    }, [isAdminMode, mode]);

    // Set authStep when mode changes on mount
    useEffect(() => {
        if (!hasSetInitialAuthStep.current && initialMode === 'signup') {
            hasSetInitialAuthStep.current = true;
            setAuthStep('register');
        }
    }, [initialMode, setAuthStep]);

    // Password validation
    const { requirements: passwordRequirements, allMet: allRequirementsMet } = usePasswordValidation(password);

    // Email validation helper
    const validateEmail = useCallback((email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), []);

    return {
        // Auth store
        isLoading,
        authStep,
        setAuthStep,
        user,
        register,
        login,

        // Form state
        mode,
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

        // Password validation
        passwordRequirements,
        allRequirementsMet,

        // Helpers
        validateEmail,
    };
}
