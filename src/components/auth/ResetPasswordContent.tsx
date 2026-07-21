"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Lock, Eye, EyeOff, Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/stores/authStore';
import { usePasswordValidation } from '@/hooks';

const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'CheapestGo';

export function ResetPasswordContent() {
    const t = useTranslations('auth');
    const { isLoading } = useAuthStore();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const { requirements, allMet } = usePasswordValidation(password);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!allMet) { setError(t('messages.requirementsNotMet')); return; }
        if (password !== confirmPassword) { setError(t('messages.passwordsDoNotMatch')); return; }

        const token = new URLSearchParams(window.location.search).get('token');
        if (!token) { setError(t('messages.invalidLink')); return; }

        try {
            const res = await fetch('/api/auth/reset-password', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
                body: JSON.stringify({ token, password }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || t('messages.failedToReset'));
            setSuccess(true);
        } catch (err: any) {
            setError(err?.message || t('messages.failedToReset'));
        }
    };

    if (success) {
        return (
            <div className="min-h-screen flex flex-col">
                <main className="flex-1 flex items-center justify-center p-4">
                    <div className="w-full max-w-md text-center">
                        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-white/10 p-8">
                            <div className="size-16 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
                            </div>
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                                {t('resetPassword.successTitle')}
                            </h2>
                            <p className="text-slate-500 dark:text-slate-400 mb-6">
                                {t('resetPassword.successDescription')}
                            </p>
                            <Link
                                href="/login"
                                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-full transition-colors"
                            >
                                {t('actions.signIn')}
                            </Link>
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col">
            {/* Header */}
            <header className="w-full py-6 px-8">
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                >
                    <ArrowLeft className="h-4 w-4" />
                    {t('actions.backToHome')}
                </Link>
            </header>

            {/* Main Content */}
            <main className="flex-1 flex items-center justify-center p-4">
                <div className="w-full max-w-md">
                    {/* Logo */}
                    <div className="flex justify-center mb-8">
                        <Link href="/" className="flex items-center gap-3">
                            <h1 className="text-slate-900 dark:text-white font-display font-bold text-2xl tracking-tight">
                                {BRAND_NAME === 'CheapestGo'
                                    ? <>Cheapest<span className="text-alabaster-accent dark:text-obsidian-accent">Go</span></>
                                    : BRAND_NAME === 'GeomeeGo'
                                    ? <>Geomee<span className="text-alabaster-accent dark:text-obsidian-accent">Go</span></>
                                    : BRAND_NAME}
                            </h1>
                        </Link>
                    </div>

                    {/* Reset Password Card */}
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-white/10 p-8">
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                            {t('resetPassword.title')}
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                            {t('resetPassword.subtitle')}
                        </p>

                        {error && (
                            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    {t('resetPassword.newPasswordLabel')}
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Lock className="h-5 w-5 text-slate-400" />
                                    </div>
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        id="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder={t('resetPassword.newPasswordPlaceholder')}
                                        className="w-full pl-10 pr-12 py-3 border border-slate-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                                        disabled={isLoading}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        aria-label={showPassword ? t('actions.hidePassword') : t('actions.showPassword')}
                                        className="absolute inset-y-0 right-0 pr-3 flex items-center"
                                    >
                                        {showPassword ? (
                                            <EyeOff className="h-5 w-5 text-slate-400 hover:text-slate-600" />
                                        ) : (
                                            <Eye className="h-5 w-5 text-slate-400 hover:text-slate-600" />
                                        )}
                                    </button>
                                </div>

                                {password && (
                                    <div className="mt-3 space-y-2">
                                        {requirements.map((req, index) => {
                                            const labelKey = ['passwordRequirements.minLength', 'passwordRequirements.uppercase', 'passwordRequirements.lowercase', 'passwordRequirements.number'][index];
                                            return (
                                                <div key={index} className="flex items-center gap-2">
                                                    {req.met ? (
                                                        <Check className="h-4 w-4 text-green-500" />
                                                    ) : (
                                                        <X className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                                                    )}
                                                    <span className={`text-xs ${req.met ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                                        {t(labelKey)}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div>
                                <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    {t('resetPassword.confirmPasswordLabel')}
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Lock className="h-5 w-5 text-slate-400" />
                                    </div>
                                    <input
                                        type={showConfirmPassword ? 'text' : 'password'}
                                        id="confirmPassword"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder={t('resetPassword.confirmPasswordPlaceholder')}
                                        className="w-full pl-10 pr-12 py-3 border border-slate-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                                        disabled={isLoading}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        aria-label={showConfirmPassword ? t('actions.hidePassword') : t('actions.showPassword')}
                                        className="absolute inset-y-0 right-0 pr-3 flex items-center"
                                    >
                                        {showConfirmPassword ? (
                                            <EyeOff className="h-5 w-5 text-slate-400 hover:text-slate-600" />
                                        ) : (
                                            <Eye className="h-5 w-5 text-slate-400 hover:text-slate-600" />
                                        )}
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading || !allMet}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isLoading ? (
                                    <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    t('actions.resetPassword')
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            </main>
        </div>
    );
}
