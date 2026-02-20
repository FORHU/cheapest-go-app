'use client';

import React from 'react';
import Link from 'next/link';
import { PlaneTakeoff, ArrowLeft } from 'lucide-react';

interface AuthHeaderProps {
    title: string;
    subtitle: string;
    onBack?: () => void;
}

export function AuthHeader({ title, subtitle, onBack }: AuthHeaderProps) {
    return (
        <>
            {/* Back Button */}
            <Link
                href="/"
                className="absolute top-6 left-6 inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                onClick={onBack}
            >
                <ArrowLeft className="h-5 w-5" />
            </Link>

            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 mb-8">
                <div className="size-10 flex items-center justify-center bg-slate-900 dark:bg-white/5 rounded-lg shadow-sm border border-transparent dark:border-white/10">
                    <PlaneTakeoff className="text-white dark:text-obsidian-accent w-6 h-6" />
                </div>
                <h1 className="text-slate-900 dark:text-white font-display font-bold text-xl tracking-tight">
                    Cheapest<span className="text-alabaster-accent dark:text-obsidian-accent">Go</span>
                </h1>
            </Link>

            {/* Header */}
            <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                    {title}
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {subtitle}
                </p>
            </div>
        </>
    );
}
