"use client";

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Briefcase, Settings, Star, ChevronDown } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';


interface SignInDropdownProps {
    /** 'dropdown' (default) = desktop popup; 'inline' = renders directly for mobile drawer */
    variant?: 'dropdown' | 'inline';
    /** When true (with variant="inline"), show a trigger that expands to reveal content (for hamburger menu) */
    collapsible?: boolean;
    /** Optional callback when a navigation action is taken (e.g. to close a parent drawer) */
    onNavigate?: () => void;
    /** Optional callback when collapsible open state changes */
    onToggleOpen?: (open: boolean) => void;
}

const SignInDropdown: React.FC<SignInDropdownProps> = ({ variant = 'dropdown', collapsible = false, onNavigate, onToggleOpen }) => {
    const { user, logout, openAuthModal } = useAuthStore();
    const [isOpen, setIsOpen] = useState(false);
    const [isInlineOpen, setIsInlineOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Helper to build redirect URL
    const getRedirectLink = (base: string = '/login', mode?: string) => {
        const fullPath = pathname + (searchParams?.toString() || '');
        const params = new URLSearchParams();
        if (mode) params.set('mode', mode);
        if (pathname !== '/' && pathname !== '/login') {
            params.set('redirect', pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : ''));
        }
        const queryString = params.toString();
        return queryString ? `${base}?${queryString}` : base;
    };


    const setInlineOpen = (open: boolean) => {
        setIsInlineOpen(open);
        onToggleOpen?.(open);
    };

    // Close dropdown when clicking outside (only for dropdown variant)
    useEffect(() => {
        if (variant === 'inline') return;
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [variant]);

    // Close dropdown on escape key (only for dropdown variant)
    useEffect(() => {
        if (variant === 'inline') return;
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [variant]);

    const handleNav = () => {
        setIsOpen(false);
        setIsInlineOpen(false);
        onNavigate?.();
    };

    /* ─── INLINE VARIANT (for mobile drawer) ─── */
    if (variant === 'inline') {
        const inlineContent = user ? (
            <>
                {/* User Info */}
                <div className="flex items-center gap-3">
                    <div className="size-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-medium text-[clamp(0.75rem,1.5vw,0.875rem)]">
                        {user.firstName[0]}{user.lastName[0]}
                    </div>
                    <div className="min-w-0">
                        <p className="font-medium text-[clamp(0.8125rem,1.5vw,0.875rem)] text-slate-900 dark:text-white truncate">
                            {user.firstName} {user.lastName}
                        </p>
                        <p className="text-[clamp(0.6875rem,1.25vw,0.75rem)] text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
                    </div>
                </div>

                {/* Rewards */}
                <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg">
                    <Star className="h-4 w-4 text-yellow-500 shrink-0" />
                    <div>
                        <p className="text-[clamp(0.6875rem,1.25vw,0.75rem)] font-medium text-slate-900 dark:text-white">Gold Member</p>
                        <p className="text-[clamp(0.625rem,1.1vw,0.6875rem)] text-slate-500 dark:text-slate-400">2,450 points</p>
                    </div>
                </div>

                {/* Links */}
                <div className="space-y-0.5">
                    <Link
                        href="/trips"
                        onClick={handleNav}
                        className="flex items-center gap-3 px-3 py-1.5 text-[clamp(0.75rem,2vw,0.8125rem)] text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
                    >
                        <Briefcase className="h-4 w-4 text-slate-400" />
                        My Trips
                    </Link>
                    <Link
                        href="/account"
                        onClick={handleNav}
                        className="flex items-center gap-3 px-3 py-1.5 text-[clamp(0.75rem,2vw,0.8125rem)] text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
                    >
                        <Settings className="h-4 w-4 text-slate-400" />
                        Account Settings
                    </Link>
                </div>

                {/* Sign Out */}
                <button
                    onClick={() => { logout(); handleNav(); }}
                    className="w-full flex items-center gap-3 px-3 py-1.5 text-[clamp(0.75rem,2vw,0.8125rem)] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-colors"
                >
                    <LogOut className="h-4 w-4" />
                    Sign out
                </button>
            </>
        ) : (
            <div className="space-y-2">
                <Link
                    href={getRedirectLink('/login')}
                    onClick={handleNav}
                    className="block w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium rounded-full transition-colors text-center"
                >
                    Sign in
                </Link>
                <Link
                    href={getRedirectLink('/login', 'signup')}
                    onClick={handleNav}
                    className="block w-full py-2 px-4 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-white text-[13px] font-medium rounded-full hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-center"
                >
                    Create an account
                </Link>

            </div>
        );

        if (collapsible) {
            return (
                <div className="w-full">
                    <button
                        type="button"
                        onClick={() => setInlineOpen(!isInlineOpen)}
                        className="flex items-center justify-between w-full min-h-[40px] px-3.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800/50 text-left text-[13px] font-medium text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    >
                        <span>{user ? 'Account' : 'Sign in'}</span>
                        <ChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${isInlineOpen ? 'rotate-180' : ''}`} />
                    </button>
                    <AnimatePresence>
                        {isInlineOpen && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                            >
                                <div className="mt-3 space-y-3 pt-3 border-t border-slate-200 dark:border-white/10">
                                    {inlineContent}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            );
        }

        return <div className="space-y-3">{inlineContent}</div>;
    }

    /* ─── DROPDOWN VARIANT (desktop) ─── */
    if (user) {
        // Logged in state
        return (
            <div ref={dropdownRef} className="relative">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex items-center gap-2 px-3 py-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                >
                    <div className="size-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-medium text-[clamp(0.75rem,1.5vw,0.875rem)]">
                        {user.firstName[0]}{user.lastName[0]}
                    </div>
                </button>

                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: -8, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -8, scale: 0.96 }}
                            transition={{ duration: 0.15 }}
                            className="absolute right-0 top-full mt-2 w-full min-w-[280px] bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-white/10 overflow-hidden z-50"
                        >
                            {/* User Info */}
                            <div className="p-4 border-b border-slate-100 dark:border-white/5">
                                <div className="flex items-center gap-3">
                                    <div className="size-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-medium text-[clamp(1rem,2vw,1.125rem)]">
                                        {user.firstName[0]}{user.lastName[0]}
                                    </div>
                                    <div>
                                        <p className="font-medium text-[clamp(0.875rem,2vw,1rem)] text-slate-900 dark:text-white">
                                            {user.firstName} {user.lastName}
                                        </p>
                                        <p className="text-[clamp(0.8125rem,1.5vw,0.875rem)] text-slate-500 dark:text-slate-400">{user.email}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Menu Items */}
                            <div className="py-2">
                                <Link
                                    href="/trips"
                                    className="flex items-center gap-3 px-4 py-2.5 text-[clamp(0.8125rem,1.5vw,0.875rem)] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                                    onClick={handleNav}
                                >
                                    <Briefcase className="h-5 w-5 text-slate-400" />
                                    My Trips
                                </Link>
                                <Link
                                    href="/account"
                                    className="flex items-center gap-3 px-4 py-2.5 text-[clamp(0.8125rem,1.5vw,0.875rem)] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                                    onClick={handleNav}
                                >
                                    <Settings className="h-5 w-5 text-slate-400" />
                                    Account Settings
                                </Link>
                            </div>

                            {/* Logout */}
                            <div className="border-t border-slate-100 dark:border-white/5 p-2">
                                <button
                                    onClick={() => {
                                        logout();
                                        handleNav();
                                    }}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 text-[clamp(0.8125rem,1.5vw,0.875rem)] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-colors"
                                >
                                    <LogOut className="h-5 w-5" />
                                    Sign out
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    }

    // Logged out state
    return (
        <div ref={dropdownRef} className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-4 py-2 text-[clamp(0.8125rem,1.5vw,0.875rem)] font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-full transition-colors"
            >
                Sign in
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.96 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-full mt-2 w-full min-w-[280px] bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-white/10 overflow-hidden z-50"
                    >
                        {/* Promo Banner */}
                        <div className="p-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white">
                            <p className="font-medium text-[clamp(0.875rem,2vw,1rem)]">Members save 10% or more</p>
                            <p className="text-[clamp(0.8125rem,1.5vw,0.875rem)] text-blue-100 mt-1">
                                on select stays when signed in
                            </p>
                        </div>

                        {/* Actions */}
                        <div className="p-4 space-y-3">
                            <Link
                                href={getRedirectLink('/login')}
                                onClick={handleNav}
                                className="block w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white text-[clamp(0.8125rem,1.5vw,0.875rem)] font-medium rounded-full transition-colors text-center"
                            >
                                Sign in
                            </Link>
                            <Link
                                href={getRedirectLink('/login', 'signup')}
                                onClick={handleNav}
                                className="block w-full py-3 px-4 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-white text-[clamp(0.8125rem,1.5vw,0.875rem)] font-medium rounded-full hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-center"
                            >
                                Create an account
                            </Link>
                        </div>


                        {/* Links */}
                        <div className="border-t border-slate-100 dark:border-white/5 py-2">
                            <Link
                                href={getRedirectLink('/login', 'signin')}
                                className="flex items-center gap-3 px-4 py-2.5 text-[clamp(0.8125rem,1.5vw,0.875rem)] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                                onClick={handleNav}
                            >
                                <Briefcase className="h-5 w-5 text-slate-400" />
                                My Trips
                            </Link>

                            <Link
                                href="#"
                                className="flex items-center gap-3 px-4 py-2.5 text-[clamp(0.8125rem,1.5vw,0.875rem)] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                                onClick={handleNav}
                            >
                                <Star className="h-5 w-5 text-slate-400" />
                                Rewards
                            </Link>
                        </div>

                        {/* Info */}
                        <div className="border-t border-slate-100 dark:border-white/5 p-4">
                            <p className="text-[clamp(0.6875rem,1.25vw,0.75rem)] text-slate-500 dark:text-slate-400 text-center">
                                Your account works across CheapestGo and all partner sites
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default SignInDropdown;
