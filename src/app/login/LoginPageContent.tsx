"use client";

import React, { Suspense, useCallback } from 'react';
import { toast } from 'sonner';
import { useLoginForm } from '@/hooks';
import SocialLoginButtons from '@/components/auth/SocialLoginButtons';
import VerifyEmailStep from '@/components/auth/VerifyEmailStep';
import {
    AuthHeader,
    EmailField,
    PasswordField,
    NameFields,
    AuthFooter,
} from '@/components/login';

function LoginFormContent() {
    // All login state and logic from hook
    const {
        isLoading,
        authStep,
        setAuthStep,
        register,
        login,
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
        passwordRequirements,
        allRequirementsMet,
        validateEmail,
    } = useLoginForm();

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        const newErrors: Record<string, string> = {};

        if (!email.trim() || !validateEmail(email)) {
            newErrors.email = 'Valid email required';
        }
        if (mode === 'signup') {
            if (!firstName.trim()) newErrors.firstName = 'Required';
            if (!lastName.trim()) newErrors.lastName = 'Required';
            if (!password || !allRequirementsMet) newErrors.password = 'Password does not meet requirements';
        } else {
            if (!password) newErrors.password = 'Password required';
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        try {
            if (mode === 'signup') {
                await register({ email, password, firstName, lastName });
                toast.success("Account created successfully!");
            } else {
                await login(email, password);
                toast.success("Welcome back!");
            }
        } catch (error: any) {
            if (error?.code === 'over_email_send_rate_limit' || error?.message?.includes('rate limit')) {
                toast.warning("Please check your email. Verification link already sent.");
                setAuthStep('verify-email');
                return;
            }

            if (mode === 'signup' && error?.message?.includes('already registered')) {
                try {
                    toast.info("Account already exists. Attempting to sign in...");
                    await login(email, password);
                    toast.success("Welcome back!");
                    return;
                } catch (loginError: any) {
                    if (loginError?.message?.toLowerCase().includes('email not confirmed')) {
                        setAuthStep('verify-email');
                        return;
                    }
                    toast.error("Account exists. Please sign in.");
                    setMode('signin');
                    setAuthStep('password');
                    return;
                }
            }

            if (error?.message?.toLowerCase().includes('email not confirmed')) {
                setAuthStep('verify-email');
                return;
            }

            setErrors({ general: error?.message || 'Authentication failed. Please try again.' });
            toast.error(error?.message || 'Authentication failed');
        }
    }, [email, password, firstName, lastName, mode, allRequirementsMet, validateEmail, register, login, setErrors, setAuthStep, setMode]);

    const handleToggleMode = useCallback(() => {
        setMode(mode === 'signin' ? 'signup' : 'signin');
        setErrors({});
    }, [mode, setMode, setErrors]);

    const clearError = useCallback((field: string) => () => {
        setErrors({ ...errors, [field]: '' });
    }, [errors, setErrors]);

    return (
        <div className="min-h-screen">
            <div className="flex flex-col items-center pt-8 pb-12 px-6">
                <AuthHeader
                    title={mode === 'signin' ? 'Sign in' : 'Create an account'}
                    subtitle="One account for all your travel needs"
                    onBack={() => setAuthStep('email')}
                />

                <div className="w-full max-w-md">
                    {authStep === 'verify-email' ? (
                        <div className="mt-8">
                            <VerifyEmailStep />
                        </div>
                    ) : (
                        <>
                            <SocialLoginButtons />

                            {errors.general && (
                                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                                    <p className="text-sm text-red-600 dark:text-red-400">{errors.general}</p>
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="space-y-4">
                                <EmailField
                                    value={email}
                                    onChange={setEmail}
                                    error={errors.email}
                                    onErrorClear={clearError('email')}
                                    disabled={isLoading}
                                />

                                {mode === 'signup' && (
                                    <NameFields
                                        firstName={firstName}
                                        lastName={lastName}
                                        onFirstNameChange={setFirstName}
                                        onLastNameChange={setLastName}
                                        firstNameError={errors.firstName}
                                        lastNameError={errors.lastName}
                                        onFirstNameErrorClear={clearError('firstName')}
                                        onLastNameErrorClear={clearError('lastName')}
                                        disabled={isLoading}
                                    />
                                )}

                                <PasswordField
                                    value={password}
                                    onChange={setPassword}
                                    error={errors.password}
                                    onErrorClear={clearError('password')}
                                    disabled={isLoading}
                                    placeholder={mode === 'signin' ? 'Enter your password' : 'Create a password'}
                                    showRequirements={mode === 'signup'}
                                />

                                {mode === 'signin' && (
                                    <div className="text-right">
                                        <button type="button" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                                            Forgot password?
                                        </button>
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-full transition-colors disabled:opacity-50"
                                >
                                    {isLoading ? (
                                        <div className="h-5 w-5 mx-auto border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        mode === 'signin' ? 'Sign in' : 'Create account'
                                    )}
                                </button>
                            </form>

                            <AuthFooter mode={mode} onToggleMode={handleToggleMode} />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function LoginPageContent() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <div className="h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
        }>
            <LoginFormContent />
        </Suspense>
    );
}
