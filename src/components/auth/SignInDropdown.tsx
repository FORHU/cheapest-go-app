"use client";

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, ChevronDown, LogOut, Briefcase, Settings, Star } from 'lucide-react';
import { useAuth } from './AuthContext';
import Link from 'next/link';

const SignInDropdown: React.FC = () => {
    const { user, openAuthModal, logout } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Close dropdown on escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, []);

    const handleSignInClick = () => {
        setIsOpen(false);
        openAuthModal();
    };

    if (user) {
        // Logged in state
        return (
            <div ref={dropdownRef} className="relative">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex items-center gap-2 px-3 py-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                >
                    <div className="size-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-medium text-sm">
                        {user.firstName[0]}{user.lastName[0]}
                    </div>
                    <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: 8, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 8, scale: 0.96 }}
                            transition={{ duration: 0.15 }}
                            className="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-white/10 overflow-hidden z-50"
                        >
                            {/* User Info */}
                            <div className="p-4 border-b border-slate-100 dark:border-white/5">
                                <div className="flex items-center gap-3">
                                    <div className="size-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-medium text-lg">
                                        {user.firstName[0]}{user.lastName[0]}
                                    </div>
                                    <div>
                                        <p className="font-medium text-slate-900 dark:text-white">
                                            {user.firstName} {user.lastName}
                                        </p>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">{user.email}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Rewards Banner */}
                            <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-b border-slate-100 dark:border-white/5">
                                <div className="flex items-center gap-2">
                                    <Star className="h-5 w-5 text-yellow-500" />
                                    <div>
                                        <p className="text-sm font-medium text-slate-900 dark:text-white">Gold Member</p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">2,450 points available</p>
                                    </div>
                                </div>
                            </div>

                            {/* Menu Items */}
                            <div className="py-2">
                                <Link
                                    href="#"
                                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                                    onClick={() => setIsOpen(false)}
                                >
                                    <Briefcase className="h-5 w-5 text-slate-400" />
                                    My Trips
                                </Link>
                                <Link
                                    href="/account"
                                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                                    onClick={() => setIsOpen(false)}
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
                                        setIsOpen(false);
                                    }}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-colors"
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
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-full transition-colors"
            >
                Sign in
                <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.96 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-white/10 overflow-hidden z-50"
                    >
                        {/* Promo Banner */}
                        <div className="p-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white">
                            <p className="font-medium">Members save 10% or more</p>
                            <p className="text-sm text-blue-100 mt-1">
                                on select stays when signed in
                            </p>
                        </div>

                        {/* Actions */}
                        <div className="p-4 space-y-3">
                            <button
                                onClick={handleSignInClick}
                                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-full transition-colors"
                            >
                                Sign in
                            </button>
                            <button
                                onClick={handleSignInClick}
                                className="w-full py-3 px-4 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-white font-medium rounded-full hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                            >
                                Create an account
                            </button>
                        </div>

                        {/* Links */}
                        <div className="border-t border-slate-100 dark:border-white/5 py-2">
                            <Link
                                href="#"
                                className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                                onClick={() => setIsOpen(false)}
                            >
                                <Briefcase className="h-5 w-5 text-slate-400" />
                                My Trips
                            </Link>
                            <Link
                                href="#"
                                className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                                onClick={() => setIsOpen(false)}
                            >
                                <Star className="h-5 w-5 text-slate-400" />
                                Rewards
                            </Link>
                        </div>

                        {/* Info */}
                        <div className="border-t border-slate-100 dark:border-white/5 p-4">
                            <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                                Your account works across AeroVantage and all partner sites
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default SignInDropdown;
