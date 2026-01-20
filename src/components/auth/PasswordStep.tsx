"use client";

import React, { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Lock } from 'lucide-react';
import { useAuth } from './AuthContext';

const PasswordStep: React.FC = () => {
    const { email, setAuthStep, login, isLoading } = useAuth();
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [rememberMe, setRememberMe] = useState(true);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!password) {
            setError('Please enter your password');
            return;
        }

        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        try {
            await login(email, password);
        } catch {
            setError('Invalid email or password. Please try again.');
        }
    };

    return (
        <div className="space-y-6">
            {/* Back Button & Header */}
            <div>
                <button
                    onClick={() => setAuthStep('email')}
                    className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors mb-4"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                </button>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                    Enter your password
                </h2>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    for <span className="font-medium text-slate-700 dark:text-slate-300">{email}</span>
                </p>
            </div>

            {/* Password Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Password
                    </label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Lock className="h-5 w-5 text-slate-400" />
                        </div>
                        <input
                            type={showPassword ? 'text' : 'password'}
                            id="password"
                            value={password}
                            onChange={(e) => {
                                setPassword(e.target.value);
                                setError('');
                            }}
                            placeholder="Enter your password"
                            className={`w-full pl-10 pr-12 py-3 border rounded-lg bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${error
                                    ? 'border-red-500 focus:ring-red-500'
                                    : 'border-slate-200 dark:border-white/10'
                                }`}
                            disabled={isLoading}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center"
                        >
                            {showPassword ? (
                                <EyeOff className="h-5 w-5 text-slate-400 hover:text-slate-600" />
                            ) : (
                                <Eye className="h-5 w-5 text-slate-400 hover:text-slate-600" />
                            )}
                        </button>
                    </div>
                    {error && (
                        <p className="mt-2 text-sm text-red-500">{error}</p>
                    )}
                </div>

                {/* Remember Me & Forgot Password */}
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

                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isLoading ? (
                        <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        'Sign in'
                    )}
                </button>
            </form>

            {/* Create Account Link */}
            <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                Don't have an account?{' '}
                <button
                    onClick={() => setAuthStep('register')}
                    className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                >
                    Create one
                </button>
            </p>
        </div>
    );
};

export default PasswordStep;
