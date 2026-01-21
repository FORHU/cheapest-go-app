"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PlaneTakeoff, ArrowLeft, Mail, User, Lock, Eye, EyeOff, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import SocialLoginButtons from '@/components/auth/SocialLoginButtons';
import VerifyEmailStep from '@/components/auth/VerifyEmailStep';

export default function LoginPage() {
    const { register, login, isLoading, authStep, setAuthStep } = useAuthStore();
    const searchParams = useSearchParams();

    const [mode, setMode] = useState<'signin' | 'signup'>('signin');
    const [email, setEmail] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    // Read mode from URL query parameter
    useEffect(() => {
        const urlMode = searchParams.get('mode');
        if (urlMode === 'signup') {
            setMode('signup');
            setAuthStep('register');
        }
    }, [searchParams, setAuthStep]);

    // Handle Auth Step changes (e.g. Back from Verify Email)
    useEffect(() => {
        if (authStep === 'password' || authStep === 'email') {
            setMode('signin');
        } else if (authStep === 'register') {
            setMode('signup');
        }
    }, [authStep]);

    // Password requirements (only for signup)
    const passwordRequirements = [
        { label: '8+ characters', met: password.length >= 8 },
        { label: 'Uppercase', met: /[A-Z]/.test(password) },
        { label: 'Lowercase', met: /[a-z]/.test(password) },
        { label: 'Number', met: /\d/.test(password) },
    ];

    const allRequirementsMet = passwordRequirements.every(req => req.met);

    const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const newErrors: Record<string, string> = {};

        if (!email.trim() || !validateEmail(email)) {
            newErrors.email = 'Valid email required';
        }
        if (mode === 'signup') {
            if (!firstName.trim()) newErrors.firstName = 'Required';
            if (!lastName.trim()) newErrors.lastName = 'Required';
            if (!password || !allRequirementsMet) newErrors.password = 'Password does not meet requirements';
        } else {
            if (!password) newErrors.password = 'Password required';
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        try {
            if (mode === 'signup') {
                // Pass directly, store handles args. Store.register signature:
                // register: (data: { email, password, firstName, lastName }) => Promise<void>
                // Note: AuthContext might have had extra args. Store doesn't seem to have `shouldOpenModal` param.
                // Store logic for register: if user, might need confirmation.
                // I will call it as per store signature.
                await register({ email, password, firstName, lastName });
                toast.success("Account created successfully!");
            } else {
                await login(email, password);
                toast.success("Welcome back!");
            }
        } catch (error: any) {
            // Check for rate limit
            if (error?.code === 'over_email_send_rate_limit' || error?.message?.includes('rate limit')) {
                toast.warning("Please check your email. Verification link already sent.");
                setAuthStep('verify-email');
                return;
            }

            // Check for duplicate user (Smart Recovery)
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
                    setMode('signin'); // Switch to sign in mode
                    setAuthStep('password');
                    return;
                }
            }

            // Check for email not confirmed during login
            if (error?.message?.toLowerCase().includes('email not confirmed')) {
                setAuthStep('verify-email');
                return;
            }

            setErrors({ general: error?.message || 'Authentication failed. Please try again.' });
            toast.error(error?.message || 'Authentication failed');
        }
    };

    // Main layout
    return (
        <div className="min-h-screen">
            {/* Back Button */}
            <Link
                href="/"
                className="absolute top-6 left-6 inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                onClick={() => setAuthStep('email')}
            >
                <ArrowLeft className="h-5 w-5" />
            </Link>

            {/* Main Content */}
            <div className="flex flex-col items-center pt-8 pb-12 px-6">
                {/* Logo */}
                <Link href="/" className="flex items-center gap-3 mb-8">
                    <div className="size-10 flex items-center justify-center bg-slate-900 dark:bg-white/5 rounded-lg shadow-sm border border-transparent dark:border-white/10">
                        <PlaneTakeoff className="text-white dark:text-obsidian-accent w-6 h-6" />
                    </div>
                    <h1 className="text-slate-900 dark:text-white font-display font-bold text-xl tracking-tight">
                        AeroVantage<span className="text-alabaster-accent dark:text-obsidian-accent">.Pro</span>
                    </h1>
                </Link>

                {/* Content Container */}
                <div className="w-full max-w-md">
                    {authStep === 'verify-email' ? (
                        <div className="mt-8">
                            <VerifyEmailStep />
                        </div>
                    ) : (
                        <>
                            {/* Header */}
                            <div className="text-center mb-6">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                                    {mode === 'signin' ? 'Sign in' : 'Create an account'}
                                </h2>
                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                    One account for all your travel needs
                                </p>
                            </div>

                            {/* Social Login (includes its own divider) */}
                            <SocialLoginButtons />

                            {errors.general && (
                                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                                    <p className="text-sm text-red-600 dark:text-red-400">{errors.general}</p>
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="space-y-4">
                                {/* Email */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Email
                                    </label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => { setEmail(e.target.value); setErrors(prev => ({ ...prev, email: '' })); }}
                                            placeholder="Enter your email"
                                            className={`w-full pl-10 pr-4 py-3 border rounded-lg bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.email ? 'border-red-500' : 'border-slate-200 dark:border-white/10'}`}
                                            disabled={isLoading}
                                        />
                                    </div>
                                    {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
                                </div>

                                {/* Name Fields (Signup only) */}
                                {mode === 'signup' && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                                First name
                                            </label>
                                            <div className="relative">
                                                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                                                <input
                                                    type="text"
                                                    value={firstName}
                                                    onChange={(e) => { setFirstName(e.target.value); setErrors(prev => ({ ...prev, firstName: '' })); }}
                                                    placeholder="First"
                                                    className={`w-full pl-10 pr-4 py-3 border rounded-lg bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.firstName ? 'border-red-500' : 'border-slate-200 dark:border-white/10'}`}
                                                    disabled={isLoading}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                                Last name
                                            </label>
                                            <input
                                                type="text"
                                                value={lastName}
                                                onChange={(e) => { setLastName(e.target.value); setErrors(prev => ({ ...prev, lastName: '' })); }}
                                                placeholder="Last"
                                                className={`w-full px-4 py-3 border rounded-lg bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.lastName ? 'border-red-500' : 'border-slate-200 dark:border-white/10'}`}
                                                disabled={isLoading}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Password */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Password
                                    </label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e) => { setPassword(e.target.value); setErrors(prev => ({ ...prev, password: '' })); }}
                                            placeholder={mode === 'signin' ? 'Enter your password' : 'Create a password'}
                                            className={`w-full pl-10 pr-12 py-3 border rounded-lg bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.password ? 'border-red-500' : 'border-slate-200 dark:border-white/10'}`}
                                            disabled={isLoading}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2"
                                        >
                                            {showPassword ? <EyeOff className="h-5 w-5 text-slate-400" /> : <Eye className="h-5 w-5 text-slate-400" />}
                                        </button>
                                    </div>
                                    {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password}</p>}

                                    {/* Password Requirements (Signup only) */}
                                    {mode === 'signup' && password && (
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {passwordRequirements.map((req, i) => (
                                                <span key={i} className={`inline-flex items-center gap-1 text-xs ${req.met ? 'text-green-600' : 'text-slate-400'}`}>
                                                    {req.met ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                                                    {req.label}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Forgot Password (Signin only) */}
                                {mode === 'signin' && (
                                    <div className="text-right">
                                        <button type="button" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                                            Forgot password?
                                        </button>
                                    </div>
                                )}

                                {/* Submit Button */}
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

                            {/* Toggle Mode */}
                            <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
                                {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
                                <button
                                    onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setErrors({}); }}
                                    className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                                >
                                    {mode === 'signin' ? 'Create one' : 'Sign in'}
                                </button>
                            </p>

                            {/* Terms */}
                            <p className="mt-4 text-xs text-center text-slate-500 dark:text-slate-400">
                                By continuing, you agree to our{' '}
                                <a href="#" className="text-blue-600 dark:text-blue-400 hover:underline">Terms & Conditions</a>
                                {' '}and{' '}
                                <a href="#" className="text-blue-600 dark:text-blue-400 hover:underline">Privacy Statement</a>
                            </p>

                            {/* Partner Logos */}
                            <div className="mt-6 flex items-center justify-center gap-4 text-sm text-slate-400 dark:text-slate-500">
                                <span className="flex items-center gap-1.5">
                                    <PlaneTakeoff className="h-4 w-4" />
                                    AeroVantage
                                </span>
                                <span>•</span>
                                <span>Hotels.com</span>
                                <span>•</span>
                                <span>Vrbo</span>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
