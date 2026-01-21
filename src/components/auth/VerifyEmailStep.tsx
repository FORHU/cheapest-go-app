"use client";

import React, { useState } from 'react';
import { Mail, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui';

const VerifyEmailStep: React.FC = () => {
    const { email, setAuthStep, resendConfirmation, isLoading } = useAuthStore();
    const [isResending, setIsResending] = useState(false);

    const handleResend = async () => {
        setIsResending(true);
        try {
            await resendConfirmation(email);
            toast.success("Confirmation email resent!");
        } catch {
            toast.error("Failed to resend email. Please try again.");
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
                    Check your email
                </h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm max-w-[280px] mx-auto">
                    We sent a confirmation link to <br />
                    <span className="font-medium text-slate-900 dark:text-white">{email}</span>
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                    Click the link in the email to sign in.
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
                    Resend confirmation email
                </Button>

                <button
                    onClick={() => setAuthStep('password')}
                    className="flex items-center justify-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors w-full"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to login
                </button>
            </div>
        </div>
    );
};

export default VerifyEmailStep;
