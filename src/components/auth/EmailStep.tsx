"use client";

import React, { useState } from 'react';
import { Mail, ArrowRight } from 'lucide-react';
import { useAuth } from './AuthContext';
import SocialLoginButtons from './SocialLoginButtons';

const EmailStep: React.FC = () => {
    const { email, setEmail, setAuthStep, isLoading } = useAuth();
    const [localEmail, setLocalEmail] = useState(email);
    const [error, setError] = useState('');

    const validateEmail = (email: string) => {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
    };

    const handleContinue = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!localEmail.trim()) {
            setError('Please enter your email address');
            return;
        }

        if (!validateEmail(localEmail)) {
            setError('Please enter a valid email address');
            return;
        }

        setEmail(localEmail);

        // Simulate checking if user exists (for demo, emails with "new" go to register)
        if (localEmail.toLowerCase().includes('new')) {
            setAuthStep('register');
        } else {
            setAuthStep('password');
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="text-center">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                    Sign in or create an account
                </h2>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    One account for all your travel needs
                </p>
            </div>

            {/* Social Login */}
            <SocialLoginButtons />

            {/* Email Form */}
            <form onSubmit={handleContinue} className="space-y-4">
                <div>
                    <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Email
                    </label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Mail className="h-5 w-5 text-slate-400" />
                        </div>
                        <input
                            type="email"
                            id="email"
                            value={localEmail}
                            onChange={(e) => {
                                setLocalEmail(e.target.value);
                                setError('');
                            }}
                            placeholder="Enter your email"
                            className={`w-full pl-10 pr-4 py-3 border rounded-lg bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${error
                                    ? 'border-red-500 focus:ring-red-500'
                                    : 'border-slate-200 dark:border-white/10'
                                }`}
                            disabled={isLoading}
                        />
                    </div>
                    {error && (
                        <p className="mt-2 text-sm text-red-500">{error}</p>
                    )}
                </div>

                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isLoading ? (
                        <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <>
                            Continue
                            <ArrowRight className="h-5 w-5" />
                        </>
                    )}
                </button>
            </form>

            {/* Other Sign-in Options */}
            <div className="pt-4 border-t border-slate-200 dark:border-white/10">
                <p className="text-center text-sm text-slate-500 dark:text-slate-400 mb-4">
                    Other ways to sign in
                </p>
                <SocialLoginButtons compact showLabels={false} />
            </div>

            {/* Terms */}
            <p className="text-xs text-center text-slate-500 dark:text-slate-400">
                By signing in, you agree to our{' '}
                <a href="#" className="text-blue-600 dark:text-blue-400 hover:underline">
                    Terms & Conditions
                </a>{' '}
                and{' '}
                <a href="#" className="text-blue-600 dark:text-blue-400 hover:underline">
                    Privacy Statement
                </a>
            </p>
        </div>
    );
};

export default EmailStep;
