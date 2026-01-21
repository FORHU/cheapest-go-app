"use client";

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, PlaneTakeoff } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import EmailStep from './EmailStep';
import PasswordStep from './PasswordStep';
import RegisterStep from './RegisterStep';
import VerifyEmailStep from './VerifyEmailStep';

const AuthModal: React.FC = () => {
    const { isAuthModalOpen, closeAuthModal, authStep } = useAuthStore();

    // Close modal on Escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                closeAuthModal();
            }
        };

        if (isAuthModalOpen) {
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = 'unset';
        };
    }, [isAuthModalOpen, closeAuthModal]);


    const renderStep = () => {
        switch (authStep) {
            case 'password':
                return <PasswordStep />;
            case 'register':
                return <RegisterStep />;
            case 'verify-email':
                return <VerifyEmailStep />;
            case 'forgot-password':
                return (
                    <div className="text-center py-8">
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                            Reset your password
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400">
                            Password reset functionality coming soon.
                        </p>
                    </div>
                );
            default:
                return <EmailStep />;
        }
    };

    return (
        <AnimatePresence>
            {isAuthModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={closeAuthModal}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
                    >
                        {/* Close Button */}
                        <button
                            onClick={closeAuthModal}
                            className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 transition-colors z-10"
                            aria-label="Close modal"
                        >
                            <X className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                        </button>

                        {/* Logo Header */}
                        <div className="pt-6 pb-3 px-6 flex justify-center flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="size-10 flex items-center justify-center bg-slate-900 dark:bg-white/5 rounded-lg shadow-sm border border-transparent dark:border-white/10">
                                    <PlaneTakeoff className="text-white dark:text-obsidian-accent w-6 h-6" />
                                </div>
                                <h1 className="text-slate-900 dark:text-white font-display font-bold text-xl tracking-tight">
                                    AeroVantage<span className="text-alabaster-accent dark:text-obsidian-accent">.Pro</span>
                                </h1>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="px-6 pb-6 overflow-y-auto flex-1">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={authStep}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    {renderStep()}
                                </motion.div>
                            </AnimatePresence>
                        </div>

                        {/* Partner Logos Footer */}
                        <div className="border-t border-slate-100 dark:border-white/5 py-3 px-6 flex-shrink-0">
                            <p className="text-xs text-center text-slate-400 dark:text-slate-500">
                                Your account works across all our partner sites
                            </p>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default AuthModal;
