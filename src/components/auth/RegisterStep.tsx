"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, User, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/stores/authStore';
import { useAuthFormStore } from '@/stores/authFormStore';
import { Input, Button } from '@/components/ui';
import { PasswordRequirements } from './PasswordRequirements';
import { registerSchema } from '@/lib/schemas/auth';

const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'CheapestGo';

const RegisterStep: React.FC = () => {
    const t = useTranslations('auth');
    const { email, setAuthStep, register, isLoading, login } = useAuthStore();
    const {
        firstName, lastName, password, errors, rememberMe,
        setField, setRememberMe, setErrors, clearErrors,
    } = useAuthFormStore();
    const [confirmPassword, setConfirmPassword] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        clearErrors();

        if (password !== confirmPassword) {
            setErrors({ confirmPassword: t('messages.passwordsDoNotMatch') });
            return;
        }

        const formData = { email, firstName, lastName, password };
        const result = registerSchema.safeParse(formData);

        if (!result.success) {
            const fieldErrors = result.error.flatten().fieldErrors;
            setErrors({
                email: fieldErrors.email?.[0] || '',
                firstName: fieldErrors.firstName?.[0] || '',
                lastName: fieldErrors.lastName?.[0] || '',
                password: fieldErrors.password?.[0] || '',
            });
            return;
        }

        try {
            await register({ email, password, firstName, lastName });
            toast.success(t('messages.accountCreated'));
        } catch (error: any) {
            if (error?.code === 'over_email_send_rate_limit' || error?.message?.includes('rate limit')) {
                toast.warning(t('messages.verificationSent'));
                setAuthStep('verify-email');
                return;
            }

            if (error?.message?.includes('already registered')) {
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
                    setAuthStep('password');
                    return;
                }
            }

            toast.error(error?.message || t('messages.registrationFailed'));
            setErrors({ general: error?.message || t('messages.registrationFailed') });
        }
    };

    return (
        <div className="space-y-6">
            <button
                onClick={() => setAuthStep('email')}
                className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                type="button"
            >
                <ArrowLeft className="h-4 w-4" />
                {t('actions.back')}
            </button>

            <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                    {t('registerStep.title')}
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {t('registerStep.for')} <span className="text-blue-600 dark:text-blue-400">{email}</span>
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                {errors.general && (
                    <div className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        {errors.general}
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                    <Input
                        id="firstName"
                        label={t('labels.firstName')}
                        value={firstName}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('firstName', e.target.value)}
                        placeholder={t('labels.firstNamePlaceholder')}
                        icon={User}
                        error={errors.firstName}
                        disabled={isLoading}
                    />
                    <Input
                        id="lastName"
                        label={t('labels.lastName')}
                        value={lastName}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('lastName', e.target.value)}
                        placeholder={t('labels.lastNamePlaceholder')}
                        error={errors.lastName}
                        disabled={isLoading}
                    />
                </div>

                <div>
                    <Input
                        id="registerPassword"
                        type="password"
                        label={t('labels.password')}
                        value={password}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('password', e.target.value)}
                        placeholder={t('labels.passwordPlaceholder')}
                        icon={Lock}
                        error={errors.password}
                        disabled={isLoading}
                    />
                    <PasswordRequirements password={password} />
                </div>

                <Input
                    id="confirmPassword"
                    type="password"
                    label={t('labels.confirmPassword')}
                    value={confirmPassword}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
                    placeholder={t('labels.confirmPasswordPlaceholder')}
                    icon={Lock}
                    error={errors.confirmPassword}
                    disabled={isLoading}
                />

                <label className="flex items-center gap-2 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-600 dark:text-slate-400">{t('registerStep.keepSignedIn')}</span>
                </label>

                <Button type="submit" fullWidth isLoading={isLoading}>
                    {t('actions.createAccount')}
                </Button>
            </form>

            <div className="space-y-2">
                <p className="text-xs text-center text-slate-500 dark:text-slate-400">
                    {t.rich('registerStep.terms', {
                        terms: (chunks) => (
                            <Link href="/terms-of-service" target="_blank" className="text-blue-600 hover:underline">
                                {chunks}
                            </Link>
                        ),
                        privacy: (chunks) => (
                            <Link href="/privacy-policy" target="_blank" className="text-blue-600 hover:underline">
                                {chunks}
                            </Link>
                        ),
                    })}
                </p>

                <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                    {t('registerStep.hasAccount')}{' '}
                    <button
                        onClick={() => setAuthStep('password')}
                        className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                    >
                        {t('actions.signIn')}
                    </button>
                </p>
            </div>

            <div className="pt-4 flex items-center justify-center gap-4 text-sm text-slate-400 dark:text-slate-500">
                <span>{BRAND_NAME}</span>
                <span>•</span>
                <span>Hotels.com</span>
                <span>•</span>
                <span>Vrbo</span>
            </div>
        </div>
    );
};

export default RegisterStep;
