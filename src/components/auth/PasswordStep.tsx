"use client";

import React, { useState } from 'react';
import { ArrowLeft, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { Input, Button } from '@/components/ui';
import { loginSchema } from '@/lib/schemas/auth';

const PasswordStep: React.FC = () => {
    const { email, setAuthStep, login, isLoading } = useAuthStore();
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [rememberMe, setRememberMe] = useState(true);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const result = loginSchema.safeParse({ email, password });

        if (!result.success) {
            const pwError = result.error.flatten().fieldErrors.password?.[0];
            if (pwError) {
                setError(pwError);
                return;
            }
        }

        try {
            await login(email, password);
            toast.success("Welcome back!");
        } catch (err: any) {
            if (err.message && (err.message.includes('Email not confirmed') || err.message.includes('email not confirmed'))) {
                return;
            }
            // Likely a Google/social account — no password set
            const isBadCredentials =
                err.message?.toLowerCase().includes('invalid login') ||
                err.message?.toLowerCase().includes('invalid credentials') ||
                err.status === 400;
            if (isBadCredentials) {
                setError("Wrong password, or this account was created with Google. Try Google sign-in or reset your password.");
            } else {
                toast.error("Invalid email or password.");
                setError("Invalid email or password.");
            }
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
                Back
            </button>

            <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                    Enter your password
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    for <span className="text-blue-600 dark:text-blue-400">{email}</span>
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                    id="password"
                    type="password"
                    label="Password"
                    value={password}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        setPassword(e.target.value);
                        setError('');
                    }}
                    placeholder="Enter your password"
                    icon={Lock}
                    error={error}
                    disabled={isLoading}
                />

                <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={rememberMe}
                            onChange={(e) => setRememberMe(e.target.checked)}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-600 dark:text-slate-400">Keep me signed in</span>
                    </label>
                    <button
                        type="button"
                        onClick={() => setAuthStep('forgot-password')}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                        Forgot password?
                    </button>
                </div>

                <Button type="submit" fullWidth isLoading={isLoading}>
                    Sign in
                </Button>
            </form>

            <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                Don&apos;t have an account?{' '}
                <button
                    onClick={() => setAuthStep('register')}
                    className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                >
                    Create one
                </button>
            </p>

            <div className="pt-4 flex items-center justify-center gap-4 text-sm text-slate-400 dark:text-slate-500">
                <span>CheapestGo</span>
                <span>•</span>
                <span>Hotels.com</span>
                <span>•</span>
                <span>Vrbo</span>
            </div>
        </div>
    );
};

export default PasswordStep;
