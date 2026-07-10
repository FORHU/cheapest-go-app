"use client";

import React, { useState } from 'react';
import { Mail, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui';

const VerifyEmailStep: React.FC = () => {
    const t = useTranslations('auth');
    const { email, setAuthStep, resendConfirmation, isLoading } = useAuthStore();
    const [isResending, setIsResending] = useState(false);

    const handleResend = async () => {
        setIsResending(true);
        try {
            await resendConfirmation(email);
            toast.success(t('messages.resentSuccess'));
        } catch {
            toast.error(t('messages.resendFailed'));
        } finally {
            setIsResending(false);
        }
    };

    return (
        <div className="space-y-6 flex flex-col items-center justify-center py-4">
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-2">
                <Mail className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            </div>

            <div className="space-y-2 text-center">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                    {t('verifyEmailStep.title')}
                </h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm max-w-[280px] mx-auto">
                    {t('verifyEmailStep.description')} <br />
                    <span className="font-medium text-slate-900 dark:text-white">{email}</span>
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                    {t('verifyEmailStep.description2')}
                </p>
            </div>

            <div className="space-y-3 w-full flex flex-col items-center">
                <Button
                    variant="link"
                    onClick={handleResend}
                    isLoading={isResending}
                    disabled={isLoading}
                    className="text-blue-600 dark:text-blue-400 font-normal"
                >
                    {t('actions.resendConfirmation')}
                </Button>

                <button
                    onClick={() => setAuthStep('password')}
                    className="flex items-center justify-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors w-full"
                >
                    <ArrowLeft className="h-4 w-4" />
                    {t('actions.backToLogin')}
                </button>
            </div>
        </div>
    );
};

export default VerifyEmailStep;
