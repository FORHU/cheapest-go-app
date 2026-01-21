"use client";

import React, { useState } from 'react';
import { ArrowLeft, User, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from './AuthContext';
import { Input, Button } from '@/components/ui';
import { PasswordRequirements } from './PasswordRequirements';
import { registerSchema } from '@/lib/schemas/auth';

const RegisterStep: React.FC = () => {
    const { email, setAuthStep, register, isLoading } = useAuth();
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [password, setPassword] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [keepSignedIn, setKeepSignedIn] = useState(true);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrors({});

        const formData = {
            email,
            firstName,
            lastName,
            password
        };

        const result = registerSchema.safeParse(formData);

        if (!result.success) {
            const fieldErrors = result.error.flatten().fieldErrors;
            setErrors({
                email: fieldErrors.email?.[0] || '',
                firstName: fieldErrors.firstName?.[0] || '',
                lastName: fieldErrors.lastName?.[0] || '',
                password: fieldErrors.password?.[0] || '',
            });
            return;
        }

        try {
            await register({ email, password, firstName, lastName });
            toast.success("Account created successfully!");
        } catch {
            toast.error("Registration failed. Please try again.");
            setErrors({ general: 'Registration failed. Please try again.' });
        }
    };

    return (
        <div className="space-y-6">
            {/* Back Button */}
            <button
                onClick={() => setAuthStep('email')}
                className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                type="button"
            >
                <ArrowLeft className="h-4 w-4" />
                Back
            </button>

            {/* Header */}
            <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                    Create your account
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    for <span className="text-blue-600 dark:text-blue-400">{email}</span>
                </p>
            </div>

            {/* Registration Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Name Fields */}
                <div className="grid grid-cols-2 gap-4">
                    <Input
                        id="firstName"
                        label="First name"
                        value={firstName}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            setFirstName(e.target.value);
                            setErrors(prev => ({ ...prev, firstName: '' }));
                        }}
                        placeholder="First"
                        icon={User}
                        error={errors.firstName}
                        disabled={isLoading}
                    />
                    <Input
                        id="lastName"
                        label="Last name"
                        value={lastName}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            setLastName(e.target.value);
                            setErrors(prev => ({ ...prev, lastName: '' }));
                        }}
                        placeholder="Last"
                        error={errors.lastName}
                        disabled={isLoading}
                    />
                </div>

                {/* Password Field */}
                <div>
                    <Input
                        id="registerPassword"
                        type="password"
                        label="Password"
                        value={password}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            setPassword(e.target.value);
                            setErrors(prev => ({ ...prev, password: '' }));
                        }}
                        placeholder="Create a password"
                        icon={Lock}
                        error={errors.password}
                        disabled={isLoading}
                    />
                    <PasswordRequirements password={password} />
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

                <Button type="submit" fullWidth isLoading={isLoading}>
                    Create account
                </Button>
            </form>

            <div className="space-y-2">
                <p className="text-xs text-center text-slate-500 dark:text-slate-400">
                    By creating an account, you agree to our{' '}
                    <a href="#" className="text-blue-600 hover:underline">Terms & Conditions</a>
                    {' '}and{' '}
                    <a href="#" className="text-blue-600 hover:underline">Privacy Statement</a>
                </p>

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

            <div className="pt-4 flex items-center justify-center gap-4 text-sm text-slate-400 dark:text-slate-500">
                <span>AeroVantage</span>
                <span>•</span>
                <span>Hotels.com</span>
                <span>•</span>
                <span>Vrbo</span>
            </div>
        </div>
    );
};

export default RegisterStep;

