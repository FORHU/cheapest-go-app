'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface AuthHeaderProps {
    title: React.ReactNode;
    subtitle: string;
    onBack?: () => void;
}

const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'CheapestGo';

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
                <h1 className="text-slate-900 dark:text-white font-display font-bold text-xl tracking-tight">
                    {BRAND_NAME === 'CheapestGo'
                        ? <>Cheapest<span className="text-alabaster-accent dark:text-obsidian-accent">Go</span></>
                        : BRAND_NAME === 'GeomeeGo'
                        ? <>Geomee<span className="text-alabaster-accent dark:text-obsidian-accent">Go</span></>
                        : BRAND_NAME}
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
