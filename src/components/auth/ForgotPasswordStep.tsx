"use client";

import React, { useState } from 'react';
import { ArrowLeft, Mail, CheckCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/stores/authStore';
import { Input, Button } from '@/components/ui';

const ForgotPasswordStep: React.FC = () => {
    const t = useTranslations('auth');
    const { email: storedEmail, setAuthStep, resetPassword, isLoading } = useAuthStore();
    const [email, setEmail] = useState(storedEmail || '');
    const [sent, setSent] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            await resetPassword(email);
            setSent(true);
        } catch (err: any) {
            setError(err?.message || t('messages.sendResetFailed'));
        }
    };

    if (sent) {
        return (
            <div className="text-center space-y-4 py-4">
                <div className="flex justify-center">
                    <CheckCircle className="h-12 w-12 text-green-500" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('forgotPasswordStep.checkInbox')}</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    {t.rich('forgotPasswordStep.sentDescription', {
                        email: email,
                    })}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                    {t('forgotPasswordStep.notReceived')}{' '}
                    <button
                        onClick={() => setSent(false)}
                        className="text-alabaster-accent dark:text-obsidian-accent hover:underline"
                    >
                        {t('actions.tryAgain')}
                    </button>.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <button
                onClick={() => setAuthStep('password')}
                className="flex items-center gap-1 text-sm text-alabaster-accent dark:text-obsidian-accent hover:opacity-80 transition-opacity"
                type="button"
            >
                <ArrowLeft className="h-4 w-4" />
                {t('actions.back')}
            </button>

            <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white font-display">
                    {t('forgotPasswordStep.title')}
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {t('forgotPasswordStep.subtitle')}
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                    id="reset-email"
                    type="email"
                    label={t('labels.email')}
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(''); }}
                    placeholder={t('forgotPasswordStep.emailPlaceholder')}
                    icon={Mail}
                    error={error}
                    disabled={isLoading}
                />
                <Button type="submit" fullWidth isLoading={isLoading}>
                    {t('actions.sendResetLink')}
                </Button>
            </form>
        </div>
    );
};

export default ForgotPasswordStep;
