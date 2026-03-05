"use client";
import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { useAdminLoginForm } from '@/hooks/auth/useAdminLoginForm';
import { GlobalSparkle } from '@/components/ui/GlobalSparkle';

export function AdminLoginContent() {
    const {
        isLoading,
        login,
        googleLogin,
        email,
        setEmail,
        password,
        setPassword,
        errors,
    } = useAdminLoginForm();

    const [focusedField, setFocusedField] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        await login(e);
    };

    return (
        <div className="min-h-screen bg-alabaster dark:bg-obsidian text-slate-900 dark:text-white transition-colors duration-800 bg-grid-alabaster dark:bg-grid-obsidian bg-[length:40px_40px] selection:bg-blue-500/30 font-sans relative overflow-hidden flex items-center justify-center p-6">
            <GlobalSparkle />
            {/* Background Glow Layer */}
            <div className="absolute inset-0 z-0">
                {/* Subtle Glows */}
                <div className="absolute top-1/4 -left-20 w-80 h-80 bg-blue-500/10 blur-[120px] rounded-full" />
                <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-blue-600/10 blur-[120px] rounded-full" />
            </div>

            <div className="relative z-10 w-full max-w-[440px]">
                {/* Simplified Header */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center mb-8"
                >
                    <h1 className="text-3xl font-black tracking-tighter text-center uppercase leading-none text-slate-900 dark:text-white">
                        Sign In as <span className="text-blue-600">Admin</span>
                    </h1>
                </motion.div>

                {/* Clean Login Card */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 }}
                    className="bg-white dark:bg-slate-900/50 backdrop-blur-3xl border border-slate-200 dark:border-white/5 rounded-[2.5rem] p-8 shadow-xl relative overflow-hidden"
                >
                    <form onSubmit={handleSubmit} className="space-y-5 relative z-10">
                        {errors.general && (
                            <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 mb-2">
                                <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-widest text-center">{errors.general}</p>
                            </div>
                        )}

                        {/* Simplified Email Field */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-white/30 ml-1">Username</label>
                            <div className={`relative transition-all duration-200 ${focusedField === 'email' ? 'scale-[1.005]' : ''}`}>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    onFocus={() => setFocusedField('email')}
                                    onBlur={() => setFocusedField(null)}
                                    placeholder="admin@k-travel.com"
                                    className={`w-full bg-slate-50 dark:bg-black/40 border rounded-2xl py-4 px-5 text-sm font-bold transition-all outline-none ${focusedField === 'email'
                                        ? 'border-blue-500/50 bg-white dark:bg-black/60 shadow-sm'
                                        : 'border-slate-200 dark:border-white/5'
                                        } text-slate-900 dark:text-blue-100 placeholder:text-slate-300 dark:placeholder:text-white/10`}
                                    autoComplete="email"
                                />
                            </div>
                            {errors.email && <p className="text-[10px] font-black italic text-rose-500 mt-1 ml-1 uppercase tracking-wider">{errors.email}</p>}
                        </div>

                        {/* Simplified Password Field */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-white/30 ml-1">Password</label>
                            <div className={`relative transition-all duration-200 ${focusedField === 'password' ? 'scale-[1.005]' : ''}`}>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    onFocus={() => setFocusedField('password')}
                                    onBlur={() => setFocusedField(null)}
                                    placeholder="••••••••••••"
                                    className={`w-full bg-slate-50 dark:bg-black/40 border rounded-2xl py-4 px-5 text-sm font-bold transition-all outline-none ${focusedField === 'password'
                                        ? 'border-blue-500/50 bg-white dark:bg-black/60 shadow-sm'
                                        : 'border-slate-200 dark:border-white/5'
                                        } text-slate-900 dark:text-blue-100 placeholder:text-slate-300 dark:placeholder:text-white/10`}
                                    autoComplete="current-password"
                                />
                            </div>
                            {errors.password && <p className="text-[10px] font-black italic text-rose-500 mt-1 ml-1 uppercase tracking-wider">{errors.password}</p>}
                        </div>

                        {/* Simplified Login Button */}
                        <motion.button
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            disabled={isLoading}
                            className="w-full py-4.5 bg-blue-600 rounded-2xl font-black text-xs uppercase tracking-[0.2em] text-white shadow-lg hover:bg-blue-500 transition-all flex items-center justify-center gap-2"
                        >
                            {isLoading ? (
                                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    Log In
                                    <ChevronRight size={16} className="text-white/40" />
                                </>
                            )}
                        </motion.button>

                        <div className="relative py-3 flex items-center justify-center">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-slate-100 dark:border-white/5" />
                            </div>
                            <span className="relative px-3 bg-white dark:bg-[#0f172a] text-[9px] font-black uppercase tracking-[0.2em] text-slate-300 dark:text-white/10">OR</span>
                        </div>

                        {/* Simple Google Auth Button */}
                        <motion.button
                            type="button"
                            onClick={() => googleLogin()}
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            className="w-full py-3.5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl flex items-center justify-center gap-3 transition-all hover:bg-slate-50 dark:hover:bg-white/10 shadow-sm"
                        >
                            <svg className="w-4 h-4" viewBox="0 0 24 24">
                                <path
                                    fill="currentColor"
                                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                    style={{ fill: '#4285F4' }}
                                />
                                <path
                                    fill="currentColor"
                                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                    style={{ fill: '#34A853' }}
                                />
                                <path
                                    fill="currentColor"
                                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                    style={{ fill: '#FBBC05' }}
                                />
                                <path
                                    fill="currentColor"
                                    d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                    style={{ fill: '#EA4335' }}
                                />
                            </svg>
                            <span className="text-[11px] font-bold tracking-tight text-slate-700 dark:text-white/80">Sign in with Google</span>
                        </motion.button>
                    </form>
                </motion.div>
            </div>
        </div>
    );
}
