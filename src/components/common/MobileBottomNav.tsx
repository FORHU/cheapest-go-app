"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, PlaneTakeoff, Heart, User } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/utils/cn';

const navItems = [
    { label: 'Search', icon: Search, href: '/' },
    { label: 'Trips', icon: PlaneTakeoff, href: '/trips' },
    { label: 'Saved', icon: Heart, href: '/saved' },
    { label: 'Profile', icon: User, href: '/profile' },
];

export const MobileBottomNav = () => {
    const pathname = usePathname();

    return (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-[100] w-full bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 rounded-t-[12px] shadow-[0_-8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_-8px_30px_rgb(0,0,0,0.2)] safe-area-bottom">
            <nav className="flex items-center justify-around w-full px-2 py-3">
                {navItems.map((item) => {
                    const isActive = item.href === '/'
                        ? pathname === '/' || pathname === '/flights/search'
                        : pathname === item.href;

                    return (
                        <Link
                            key={item.label}
                            href={item.href}
                            className="relative flex flex-col items-center gap-1 min-w-[64px]"
                        >
                            {/* Icon Wrapper with background for active state */}
                            <div className={cn(
                                "relative p-2 rounded-2xl transition-all duration-300",
                                isActive
                                    ? "bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400"
                                    : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                            )}>
                                {isActive && (
                                    <motion.div
                                        layoutId="nav-bg"
                                        className="absolute inset-0 bg-blue-50 dark:bg-blue-500/20 rounded-2xl -z-10"
                                        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                                    />
                                )}
                                <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                            </div>

                            {/* Label */}
                            <span className={cn(
                                "text-[10px] font-bold transition-colors duration-300",
                                isActive
                                    ? "text-blue-600 dark:text-blue-400"
                                    : "text-slate-400 dark:text-slate-500"
                            )}>
                                {item.label}
                            </span>
                        </Link>
                    );
                })}
            </nav>
            {/* Safe area spacer for devices with home indicator */}
            <div className="h-[env(safe-area-inset-bottom)]" />
        </div>
    );
};
