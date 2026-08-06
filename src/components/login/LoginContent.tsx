"use client";

import React, { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { useLoginForm } from '@/hooks';
import { loginSchema, registerSchema } from '@/lib/schemas/auth';
import SocialLoginButtons from '@/components/auth/SocialLoginButtons';
import VerifyEmailStep from '@/components/auth/VerifyEmailStep';
import ForgotPasswordStep from '@/components/auth/ForgotPasswordStep';
import {
    AuthHeader,
    EmailField,
    PasswordField,
    NameFields,
    AuthFooter,
} from '@/components/login';
import { TermsAcceptanceCheckbox } from '@/components/legal/TermsAcceptanceCheckbox';

import { GlobalSparkle } from '@/components/ui/GlobalSparkle';
import { earliestPlausibleBirthDate, latestBirthDateForAge } from '@/lib/age';

interface LoginContentProps {
    isAdmin?: boolean;
}

export function LoginContent({ isAdmin = false }: LoginContentProps) {
    const t = useTranslations('auth');

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
        birthDate,
        setBirthDate,
        password,
        setPassword,
        errors,
        setErrors,
    } = useLoginForm({ isAdminMode: isAdmin });

    const [confirmPassword, setConfirmPassword] = useState('');
    const [agreedToTerms, setAgreedToTerms] = useState(false);

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();

        if (mode === 'signup' && !agreedToTerms) {
            setErrors({ terms: t('messages.acceptTerms') });
            return;
        }

        if (mode === 'signup' && password !== confirmPassword) {
            setErrors({ confirmPassword: t('messages.passwordsDoNotMatch') });
            return;
        }

        // Validate with Zod schema
        const schema = mode === 'signup' ? registerSchema : loginSchema;
        const data = mode === 'signup'
            ? { email, password, firstName, lastName, birthDate }
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
                await register({ email, password, firstName, lastName, birthDate });
                toast.success(t('messages.accountCreated'));
            } else {
                await login(email, password);
                // Admin copy stays English — the Command Center is internal-only.
                toast.success(isAdmin ? "Identity verified. Accessing Command Center..." : t('messages.welcomeBack'));
            }
        } catch (error: any) {
            if (error?.code === 'over_email_send_rate_limit' || error?.message?.includes('rate limit')) {
                toast.warning(t('messages.verificationSent'));
                setAuthStep('verify-email');
                return;
            }

            if (mode === 'signup' && error?.message?.includes('already registered')) {
                try {
                    toast.info(t('messages.accountExists'));
                    await login(email, password);
                    toast.success(t('messages.welcomeBack'));
                    return;
                } catch (loginError: any) {
                    if (loginError?.message?.toLowerCase().includes('email not confirmed')) {
                        setAuthStep('verify-email');
                        return;
                    }
                    toast.error(t('messages.accountExistsSignIn'));
                    setMode('signin');
                    setAuthStep('password');
                    return;
                }
            }

            if (error?.message?.toLowerCase().includes('email not confirmed')) {
                setAuthStep('verify-email');
                return;
            }

            // Supabase error messages arrive in English from the API — only the
            // generic fallback is translatable here.
            setErrors({ general: error?.message || t('messages.authFailed') });
            toast.error(error?.message || t('messages.authFailed'));
        }
    }, [email, password, confirmPassword, agreedToTerms, firstName, lastName, birthDate, mode, register, login, setErrors, setAuthStep, setMode, isAdmin, t]);

    const handleToggleMode = useCallback(() => {
        setMode(mode === 'signin' ? 'signup' : 'signin');
        setErrors({});
        setConfirmPassword('');
        setAgreedToTerms(false);
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
                    ) as unknown as string : (mode === 'signin' ? t('actions.signIn') : t('registerStep.title'))}
                    subtitle={isAdmin ? "Authorized personnel only" : t('emailStep.subtitle')}
                    onBack={() => setAuthStep('email')}
                />

                <div className="w-full max-w-md">
                    {authStep === 'verify-email' ? (
                        <div className="mt-8">
                            <VerifyEmailStep />
                        </div>
                    ) : authStep === 'forgot-password' ? (
                        <div className="mt-8">
                            <ForgotPasswordStep />
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
                                    <>
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
                                        <div>
                                            <label htmlFor="loginBirthDate" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                                {t('labels.birthDate')}
                                            </label>
                                            <input
                                                id="loginBirthDate"
                                                type="date"
                                                value={birthDate}
                                                onChange={(e) => setBirthDate(e.target.value)}
                                                min={earliestPlausibleBirthDate()}
                                                max={latestBirthDateForAge()}
                                                disabled={isLoading}
                                                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                                            />
                                            {errors.birthDate ? (
                                                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.birthDate}</p>
                                            ) : (
                                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('labels.birthDateHint')}</p>
                                            )}
                                        </div>
                                    </>
                                )}

                                <PasswordField
                                    value={password}
                                    onChange={setPassword}
                                    error={errors.password}
                                    onErrorClear={clearError('password')}
                                    disabled={isLoading}
                                    placeholder={mode === 'signin' ? t('labels.passwordPlaceholderSignIn') : t('labels.passwordPlaceholder')}
                                    showRequirements={mode === 'signup'}
                                />

                                {mode === 'signup' && (
                                    <PasswordField
                                        value={confirmPassword}
                                        onChange={setConfirmPassword}
                                        error={errors.confirmPassword}
                                        onErrorClear={clearError('confirmPassword')}
                                        disabled={isLoading}
                                        placeholder={t('labels.confirmPasswordPlaceholder')}
                                        label={t('labels.confirmPassword')}
                                        showRequirements={false}
                                    />
                                )}

                                {mode === 'signin' && (
                                    <div className="text-right">
                                        <button type="button" onClick={() => setAuthStep('forgot-password')} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                                            {t('actions.forgotPassword')}
                                        </button>
                                    </div>
                                )}

                                {mode === 'signup' && (
                                    <TermsAcceptanceCheckbox
                                        checked={agreedToTerms}
                                        onChange={(v) => {
                                            setAgreedToTerms(v);
                                            if (v && errors.terms) clearError('terms')();
                                        }}
                                        error={errors.terms}
                                        disabled={isLoading}
                                    />
                                )}

                                <button
                                    type="submit"
                                    disabled={isLoading || (mode === 'signup' && !agreedToTerms)}
                                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isLoading ? (
                                        <div className="h-5 w-5 mx-auto border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        mode === 'signin' ? t('actions.signIn') : t('actions.createAccount')
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
