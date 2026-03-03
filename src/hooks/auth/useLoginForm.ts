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

/**
 * Hook to manage all login/signup form state and logic.
 * Handles auth redirects, mode syncing, and form validation.
 */
export function useLoginForm(): UseLoginFormReturn {
    const { register, login, isLoading, authStep, setAuthStep, user } = useAuthStore();
    const searchParams = useSearchParams();
    const router = useRouter();

    // Compute initial mode from URL
    const initialMode = useMemo((): AuthMode => {
        const urlMode = searchParams?.get('mode');
        return urlMode === 'signup' ? 'signup' : 'signin';
    }, [searchParams]);

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
        if (user && !prevUserRef.current) {
            const redirectTo = searchParams?.get('redirect') || '/';
            router.push(redirectTo);
        }
        prevUserRef.current = user;
    }, [user, searchParams, router]);

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
