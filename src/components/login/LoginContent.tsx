"use client";

import React, { useCallback } from 'react';
import { toast } from 'sonner';
import { useLoginForm } from '@/hooks';
import { loginSchema, registerSchema } from '@/lib/schemas/auth';
import SocialLoginButtons from '@/components/auth/SocialLoginButtons';
import VerifyEmailStep from '@/components/auth/VerifyEmailStep';
import {
    AuthHeader,
    EmailField,
    PasswordField,
    NameFields,
    AuthFooter,
} from '@/components/login';

import { GlobalSparkle } from '@/components/ui/GlobalSparkle';

interface LoginContentProps {
    isAdmin?: boolean;
}

export function LoginContent({ isAdmin = false }: LoginContentProps) {
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
    } = useLoginForm({ isAdminMode: isAdmin });

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();

        // Validate with Zod schema
        const schema = mode === 'signup' ? registerSchema : loginSchema;
        const data = mode === 'signup'
            ? { email, password, firstName, lastName }
            : { email, password };

        const result = schema.safeParse(data);

        if (!result.success) {
            const fieldErrors: Record<string, string> = {};
            result.error.issues.forEach((issue) => {
                const field = issue.path[0] as string;
                if (field && !fieldErrors[field]) {
                    fieldErrors[field] = issue.message;
                }
            });
            setErrors(fieldErrors);
            return;
        }

        try {
            if (mode === 'signup') {
                await register({ email, password, firstName, lastName });
                toast.success("Account created successfully!");
            } else {
                await login(email, password);
                toast.success(isAdmin ? "Identity verified. Accessing Command Center..." : "Welcome back!");
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
    }, [email, password, firstName, lastName, mode, register, login, setErrors, setAuthStep, setMode, isAdmin]);

    const handleToggleMode = useCallback(() => {
        setMode(mode === 'signin' ? 'signup' : 'signin');
        setErrors({});
    }, [mode, setMode, setErrors]);

    const clearError = useCallback((field: string) => () => {
        setErrors({ ...errors, [field]: '' });
    }, [errors, setErrors]);

    return (
        <div className={`min-h-screen ${isAdmin ? 'bg-alabaster dark:bg-obsidian transition-colors duration-800' : ''}`}>
            {isAdmin && <GlobalSparkle />}
            <div className="flex flex-col items-center pt-8 pb-12 px-6">
                <AuthHeader
                    title={isAdmin ? (
                        <>Sign In as <span className="text-blue-600">Admin</span></>
                    ) as unknown as string : (mode === 'signin' ? 'Sign in' : 'Create an account')}
                    subtitle={isAdmin ? "Authorized personnel only" : "One account for all your travel needs"}
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

                            {!isAdmin && <AuthFooter mode={mode} onToggleMode={handleToggleMode} />}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
