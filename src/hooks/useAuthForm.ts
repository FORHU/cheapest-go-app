"use client";

import { useState, useCallback } from 'react';

interface PasswordRequirement {
    label: string;
    met: boolean;
}

interface UseAuthFormReturn {
    // Email
    email: string;
    setEmail: (email: string) => void;
    emailError: string;
    validateEmail: (email: string) => boolean;

    // Password
    password: string;
    setPassword: (password: string) => void;
    showPassword: boolean;
    toggleShowPassword: () => void;
    passwordRequirements: PasswordRequirement[];
    isPasswordValid: boolean;

    // General
    error: string;
    setError: (error: string) => void;
    clearError: () => void;
    isSubmitting: boolean;
    setIsSubmitting: (value: boolean) => void;
    reset: () => void;
}

/**
 * Custom hook for auth form handling
 * Provides email/password validation, error handling, and form state
 */
export const useAuthForm = (): UseAuthFormReturn => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [emailError, setEmailError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Email validation
    const validateEmail = useCallback((emailToValidate: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const isValid = emailRegex.test(emailToValidate);

        if (!isValid && emailToValidate.length > 0) {
            setEmailError('Please enter a valid email address');
        } else {
            setEmailError('');
        }

        return isValid;
    }, []);

    // Password requirements
    const passwordRequirements: PasswordRequirement[] = [
        { label: 'At least 8 characters', met: password.length >= 8 },
        { label: 'One uppercase letter', met: /[A-Z]/.test(password) },
        { label: 'One lowercase letter', met: /[a-z]/.test(password) },
        { label: 'One number', met: /\d/.test(password) },
    ];

    const isPasswordValid = passwordRequirements.every(req => req.met);

    // Toggle password visibility
    const toggleShowPassword = useCallback(() => {
        setShowPassword(prev => !prev);
    }, []);

    // Clear error
    const clearError = useCallback(() => {
        setError('');
        setEmailError('');
    }, []);

    // Reset form
    const reset = useCallback(() => {
        setEmail('');
        setPassword('');
        setShowPassword(false);
        setError('');
        setEmailError('');
        setIsSubmitting(false);
    }, []);

    return {
        email,
        setEmail,
        emailError,
        validateEmail,
        password,
        setPassword,
        showPassword,
        toggleShowPassword,
        passwordRequirements,
        isPasswordValid,
        error,
        setError,
        clearError,
        isSubmitting,
        setIsSubmitting,
        reset,
    };
};
