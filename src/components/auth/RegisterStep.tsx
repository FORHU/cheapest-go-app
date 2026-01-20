"use client";

import React, { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Lock, User, Check, X } from 'lucide-react';
import { useAuth } from './AuthContext';

const RegisterStep: React.FC = () => {
    const { email, setAuthStep, register, isLoading } = useAuth();
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [keepSignedIn, setKeepSignedIn] = useState(true);

    // Password requirements
    const passwordRequirements = [
        { label: 'At least 8 characters', met: password.length >= 8 },
        { label: 'One uppercase letter', met: /[A-Z]/.test(password) },
        { label: 'One lowercase letter', met: /[a-z]/.test(password) },
        { label: 'One number', met: /\d/.test(password) },
    ];

    const allRequirementsMet = passwordRequirements.every(req => req.met);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const newErrors: Record<string, string> = {};

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
            await register({ email, password, firstName, lastName });
        } catch {
            setErrors({ general: 'Registration failed. Please try again.' });
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
                    Create your account
                </h2>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    for <span className="font-medium text-slate-700 dark:text-slate-300">{email}</span>
                </p>
            </div>

            {errors.general && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-600 dark:text-red-400">{errors.general}</p>
                </div>
            )}

            {/* Registration Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Name Fields */}
                <div className="grid grid-cols-2 gap-4">
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
                    <label htmlFor="registerPassword" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Password
                    </label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Lock className="h-5 w-5 text-slate-400" />
                        </div>
                        <input
                            type={showPassword ? 'text' : 'password'}
                            id="registerPassword"
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
                        <div className="mt-3 space-y-2">
                            {passwordRequirements.map((req, index) => (
                                <div key={index} className="flex items-center gap-2">
                                    {req.met ? (
                                        <Check className="h-4 w-4 text-green-500" />
                                    ) : (
                                        <X className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                                    )}
                                    <span className={`text-xs ${req.met ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                        {req.label}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Keep Signed In */}
                <label className="flex items-center gap-2 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={keepSignedIn}
                        onChange={(e) => setKeepSignedIn(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-600 dark:text-slate-400">Keep me signed in</span>
                </label>

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

            {/* Terms */}
            <p className="text-xs text-center text-slate-500 dark:text-slate-400">
                By creating an account, you agree to our{' '}
                <a href="#" className="text-blue-600 dark:text-blue-400 hover:underline">
                    Terms & Conditions
                </a>{' '}
                and{' '}
                <a href="#" className="text-blue-600 dark:text-blue-400 hover:underline">
                    Privacy Statement
                </a>
            </p>

            {/* Sign In Link */}
            <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                Already have an account?{' '}
                <button
                    onClick={() => setAuthStep('password')}
                    className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                >
                    Sign in
                </button>
            </p>
        </div>
    );
};

export default RegisterStep;
