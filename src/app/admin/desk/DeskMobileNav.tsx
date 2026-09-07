'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Clock, MessageCircle } from 'lucide-react';

/**
 * The desk on a phone: the same bottom bar the admin uses, with only the desk in it.
 *
 * The admin's bar carries four tabs plus a "More" sheet holding every other section. That
 * sheet is the thing the desk exists to remove, so it is not copied — three tabs fit
 * without it, and a bar with nothing hidden behind it is the honest version of the design.
 */

interface DeskMobileNavProps {
    pathname: string;
    waiting: number;
}

const TABS = [
    { href: '/admin/desk', label: 'Support', icon: MessageCircle },
    { href: '/admin/desk/settings', label: 'Settings', icon: Clock },
    { href: '/admin/overview', label: 'Full admin', icon: ArrowLeft },
];

export function DeskMobileNav({ pathname, waiting }: DeskMobileNavProps) {
    return (
        <nav
            aria-label="Support desk"
            className="fixed bottom-0 inset-x-0 z-50 md:hidden bg-white/90 dark:bg-obsidian/95 backdrop-blur-xl border-t border-slate-100 dark:border-white/10 pb-safe"
        >
            <div className="flex items-stretch h-16">
                {TABS.map(tab => {
                    const isActive = pathname === tab.href;
                    const Icon = tab.icon;

                    return (
                        <Link
                            key={tab.href}
                            href={tab.href}
                            aria-current={isActive ? 'page' : undefined}
                            className="flex-1"
                        >
                            <div
                                className={`relative h-full flex flex-col items-center justify-center gap-1 transition-colors ${
                                    isActive ? 'text-blue-600' : 'text-slate-400 hover:text-blue-600'
                                }`}
                            >
                                {isActive && (
                                    <motion.div
                                        layoutId="desk-tab-indicator"
                                        className="absolute top-0 h-0.5 w-8 bg-blue-600 rounded-full"
                                    />
                                )}

                                <div className="relative">
                                    <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />

                                    {tab.href === '/admin/desk' && waiting > 0 && (
                                        <span
                                            aria-label={`${waiting} waiting for a reply`}
                                            className="absolute -top-1.5 -right-2.5 min-w-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black leading-4 text-center"
                                        >
                                            {waiting}
                                        </span>
                                    )}
                                </div>

                                <span className={`text-[10px] font-bold ${isActive ? 'text-blue-600' : ''}`}>
                                    {tab.label}
                                </span>
                            </div>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
