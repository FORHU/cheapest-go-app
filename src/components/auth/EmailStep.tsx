"use client";

import React, { useState } from 'react';
import { Mail, ArrowRight, User, Lock, Eye, EyeOff, Check, X } from 'lucide-react';
import { useAuth } from './AuthContext';
import SocialLoginButtons from './SocialLoginButtons';

const EmailStep: React.FC = () => {
    const { email, setEmail, setAuthStep, isLoading, register } = useAuth();
    const [localEmail, setLocalEmail] = useState(email);
    const [error, setError] = useState('');

    // New fields for direct signup
    const [showSignupForm, setShowSignupForm] = useState(false);
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    // Password requirements
    const passwordRequirements = [
        { label: 'At least 8 characters', met: password.length >= 8 },
        { label: 'One uppercase letter', met: /[A-Z]/.test(password) },
        { label: 'One lowercase letter', met: /[a-z]/.test(password) },
        { label: 'One number', met: /\d/.test(password) },
    ];

    const allRequirementsMet = passwordRequirements.every(req => req.met);

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

    const handleDirectSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        const newErrors: Record<string, string> = {};

        if (!localEmail.trim() || !validateEmail(localEmail)) {
            newErrors.email = 'Please enter a valid email address';
        }
        if (!firstName.trim()) {
            newErrors.firstName = 'First name is required';
        }
        if (!lastName.trim()) {
            newErrors.lastName = 'Last name is required';
        }
        if (!password) {
            newErrors.password = 'Password is required';
        } else if (!allRequirementsMet) {
            newErrors.password = 'Password does not meet requirements';
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        try {
            setEmail(localEmail);
            await register({ email: localEmail, password, firstName, lastName });
        } catch {
            setErrors({ general: 'Registration failed. Please try again.' });
        }
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="text-center">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    Sign in or create an account
                </h2>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    One account for all your travel needs
                </p>
            </div>

            {/* Social Login */}
            <SocialLoginButtons />

            {/* Toggle: Sign In vs Create Account */}
            {!showSignupForm ? (
                <>
                    {/* Email Form (Sign In) */}
                    <form onSubmit={handleContinue} className="space-y-3">
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

                    {/* Create Account Link */}
                    <div className="text-center">
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Don&apos;t have an account?{' '}
                            <button
                                onClick={() => setShowSignupForm(true)}
                                className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                            >
                                Create one with email
                            </button>
                        </p>
                    </div>
                </>
            ) : (
                <>
                    {/* Direct Signup Form */}
                    <form onSubmit={handleDirectSignup} className="space-y-4">
                        {errors.general && (
                            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                                <p className="text-sm text-red-600 dark:text-red-400">{errors.general}</p>
                            </div>
                        )}

                        {/* Email */}
                        <div>
                            <label htmlFor="signupEmail" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                Email
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Mail className="h-5 w-5 text-slate-400" />
                                </div>
                                <input
                                    type="email"
                                    id="signupEmail"
                                    value={localEmail}
                                    onChange={(e) => {
                                        setLocalEmail(e.target.value);
                                        setErrors(prev => ({ ...prev, email: '' }));
                                    }}
                                    placeholder="Enter your email"
                                    className={`w-full pl-10 pr-4 py-3 border rounded-lg bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${errors.email
                                        ? 'border-red-500 focus:ring-red-500'
                                        : 'border-slate-200 dark:border-white/10'
                                        }`}
                                    disabled={isLoading}
                                />
                            </div>
                            {errors.email && (
                                <p className="mt-1 text-xs text-red-500">{errors.email}</p>
                            )}
                        </div>

                        {/* Name Fields */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="firstName" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    First name
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <User className="h-5 w-5 text-slate-400" />
                                    </div>
                                    <input
                                        type="text"
                                        id="firstName"
                                        value={firstName}
                                        onChange={(e) => {
                                            setFirstName(e.target.value);
                                            setErrors(prev => ({ ...prev, firstName: '' }));
                                        }}
                                        placeholder="First"
                                        className={`w-full pl-10 pr-4 py-3 border rounded-lg bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${errors.firstName
                                            ? 'border-red-500 focus:ring-red-500'
                                            : 'border-slate-200 dark:border-white/10'
                                            }`}
                                        disabled={isLoading}
                                    />
                                </div>
                                {errors.firstName && (
                                    <p className="mt-1 text-xs text-red-500">{errors.firstName}</p>
                                )}
                            </div>

                            <div>
                                <label htmlFor="lastName" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    Last name
                                </label>
                                <input
                                    type="text"
                                    id="lastName"
                                    value={lastName}
                                    onChange={(e) => {
                                        setLastName(e.target.value);
                                        setErrors(prev => ({ ...prev, lastName: '' }));
                                    }}
                                    placeholder="Last"
                                    className={`w-full px-4 py-3 border rounded-lg bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${errors.lastName
                                        ? 'border-red-500 focus:ring-red-500'
                                        : 'border-slate-200 dark:border-white/10'
                                        }`}
                                    disabled={isLoading}
                                />
                                {errors.lastName && (
                                    <p className="mt-1 text-xs text-red-500">{errors.lastName}</p>
                                )}
                            </div>
                        </div>

                        {/* Password Field */}
                        <div>
                            <label htmlFor="signupPassword" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                Password
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Lock className="h-5 w-5 text-slate-400" />
                                </div>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    id="signupPassword"
                                    value={password}
                                    onChange={(e) => {
                                        setPassword(e.target.value);
                                        setErrors(prev => ({ ...prev, password: '' }));
                                    }}
                                    placeholder="Create a password"
                                    className={`w-full pl-10 pr-12 py-3 border rounded-lg bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${errors.password
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

                            {/* Password Requirements */}
                            {password && (
                                <div className="mt-3 grid grid-cols-2 gap-1">
                                    {passwordRequirements.map((req, index) => (
                                        <div key={index} className="flex items-center gap-1">
                                            {req.met ? (
                                                <Check className="h-3 w-3 text-green-500" />
                                            ) : (
                                                <X className="h-3 w-3 text-slate-300 dark:text-slate-600" />
                                            )}
                                            <span className={`text-xs ${req.met ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                                {req.label}
                                            </span>
                                        </div>
                                    ))}
                                </div>
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
                                'Create account'
                            )}
                        </button>
                    </form>

                    {/* Back to Sign In Link */}
                    <div className="text-center">
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Already have an account?{' '}
                            <button
                                onClick={() => setShowSignupForm(false)}
                                className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                            >
                                Sign in
                            </button>
                        </p>
                    </div>
                </>
            )}

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
