"use client";

import React from 'react';
import { Mail, ArrowRight, User, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { useAuthFormStore } from '@/stores/authFormStore';
import SocialLoginButtons from './SocialLoginButtons';
import { Input, Button } from '@/components/ui';
import { PasswordRequirements } from './PasswordRequirements';
import { emailSchema, registerSchema } from '@/lib/schemas/auth';

const EmailStep: React.FC = () => {
    const { setEmail, setAuthStep, isLoading, register } = useAuthStore();
    const {
        localEmail, firstName, lastName, password, errors, showSignupForm,
        setField, setShowSignupForm, setErrors, clearErrors,
    } = useAuthFormStore();

    const handleContinue = (e: React.FormEvent) => {
        e.preventDefault();
        clearErrors();

        const result = emailSchema.safeParse({ email: localEmail });

        if (!result.success) {
            setErrors({ email: result.error.flatten().fieldErrors.email?.[0] || 'Invalid email' });
            return;
        }

        setEmail(localEmail);
        if (localEmail.toLowerCase().includes('new')) {
            setAuthStep('register');
        } else {
            setAuthStep('password');
        }
    };

    const handleDirectSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        clearErrors();

        const formData = { email: localEmail, firstName, lastName, password };
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
            setEmail(localEmail);
            await register({ email: localEmail, password, firstName, lastName });
            toast.success("Account created successfully!");
        } catch (error: any) {
            if (error?.code === 'over_email_send_rate_limit' || error?.message?.includes('rate limit')) {
                toast.warning("Please check your email. Verification link already sent.");
                setAuthStep('verify-email');
                return;
            }
            toast.error(error?.message || "Registration failed. Please try again.");
            setErrors({ general: error?.message || 'Registration failed. Please try again.' });
        }
    };

    return (
        <div className="space-y-4">
            <div className="text-center">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    Sign in or create an account
                </h2>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    One account for all your travel needs
                </p>
            </div>

            <SocialLoginButtons />

            {!showSignupForm ? (
                <>
                    <form onSubmit={handleContinue} className="space-y-3">
                        <Input
                            id="email"
                            type="email"
                            label="Email"
                            value={localEmail}
                            onChange={(e) => setField('localEmail', e.target.value)}
                            placeholder="Enter your email"
                            icon={Mail}
                            error={errors.email}
                            disabled={isLoading}
                        />

                        <Button
                            type="submit"
                            fullWidth
                            isLoading={isLoading}
                            rightIcon={<ArrowRight className="h-5 w-5" />}
                        >
                            Continue
                        </Button>
                    </form>

                    <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                        Don&apos;t have an account?{' '}
                        <button
                            onClick={() => setShowSignupForm(true)}
                            className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                        >
                            Create one with email
                        </button>
                    </p>
                </>
            ) : (
                <>
                    <form onSubmit={handleDirectSignup} className="space-y-4">
                        <Input
                            id="signupEmail"
                            type="email"
                            label="Email"
                            value={localEmail}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('localEmail', e.target.value)}
                            placeholder="Enter your email"
                            icon={Mail}
                            error={errors.email}
                            disabled={isLoading}
                        />

                        <div className="grid grid-cols-2 gap-3">
                            <Input
                                id="firstName"
                                label="First name"
                                value={firstName}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('firstName', e.target.value)}
                                placeholder="First"
                                icon={User}
                                error={errors.firstName}
                                disabled={isLoading}
                            />
                            <Input
                                id="lastName"
                                label="Last name"
                                value={lastName}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('lastName', e.target.value)}
                                placeholder="Last"
                                error={errors.lastName}
                                disabled={isLoading}
                            />
                        </div>

                        <div>
                            <Input
                                id="signupPassword"
                                type="password"
                                label="Password"
                                value={password}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('password', e.target.value)}
                                placeholder="Create a password"
                                icon={Lock}
                                error={errors.password}
                                disabled={isLoading}
                            />
                            <PasswordRequirements password={password} />
                        </div>

                        <Button type="submit" fullWidth isLoading={isLoading}>
                            Create account
                        </Button>
                    </form>

                    <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                        Already have an account?{' '}
                        <button
                            onClick={() => setShowSignupForm(false)}
                            className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                        >
                            Sign in
                        </button>
                    </p>
                </>
            )}

            <div className="pt-4 border-t border-slate-200 dark:border-white/10 text-center">
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Other ways to sign in</p>
                <SocialLoginButtons compact showLabels={false} />
            </div>

            <p className="text-xs text-center text-slate-500 dark:text-slate-400">
                By signing in, you agree to our{' '}
                <a href="#" className="text-blue-600 hover:underline">Terms & Conditions</a>
                {' '}and{' '}
                <a href="#" className="text-blue-600 hover:underline">Privacy Statement</a>
            </p>
        </div>
    );
};

export default EmailStep;
