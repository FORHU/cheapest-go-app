"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, PlaneTakeoff, Heart, User, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/utils/cn';
import SignInDropdown from '../auth/SignInDropdown';

const navItems = [
    { label: 'Search', icon: Search, href: '/' },
    { label: 'Trips', icon: PlaneTakeoff, href: '/trips' },
    { label: 'Profile', icon: User, href: '#profile' },
];

export const MobileBottomNav = () => {
    const pathname = usePathname();
    const [isProfileOpen, setIsProfileOpen] = React.useState(false);

    return (
        <>
            <div className="lg:hidden fixed bottom-0 left-0 right-0 z-[100] w-full bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 rounded-t-[12px] shadow-[0_-8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_-8px_30px_rgb(0,0,0,0.2)]">
                <nav className="flex items-center justify-around w-full px-2 py-1.5">
                    {navItems.map((item) => {
                        const isProfile = item.label === 'Profile';
                        const isActive = isProfile 
                            ? isProfileOpen
                            : item.href === '/'
                                ? pathname === '/' || pathname === '/flights/search'
                                : pathname === item.href;

                        const content = (
                            <div className="relative flex flex-col items-center gap-1 min-w-[64px]">
                                {/* Icon Wrapper with background for active state */}
                                <div className={cn(
                                    "relative p-2.5 rounded-2xl transition-all duration-300",
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
                                    <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
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
                            </div>
                        );

                        if (isProfile) {
                            return (
                                <button
                                    key={item.label}
                                    onClick={() => setIsProfileOpen(!isProfileOpen)}
                                    className="relative"
                                >
                                    {content}
                                </button>
                            );
                        }

                        return (
                            <Link
                                key={item.label}
                                href={item.href}
                                onClick={() => setIsProfileOpen(false)}
                            >
                                {content}
                            </Link>
                        );
                    })}
                </nav>
                {/* Safe area spacer for devices with home indicator */}
                <div className="h-[env(safe-area-inset-bottom)]" />
            </div>

            {/* Profile Drawer */}
            <AnimatePresence>
                {isProfileOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsProfileOpen(false)}
                            className="fixed inset-0 bg-black/50 z-[101] lg:hidden"
                        />
                        {/* Drawer */}
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="fixed bottom-0 left-0 right-0 z-[102] bg-white dark:bg-slate-900 rounded-t-[24px] shadow-2xl lg:hidden max-h-[85vh] overflow-hidden flex flex-col"
                        >
                            {/* Drawer Handle */}
                            <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full mx-auto my-3 shrink-0" />
                            
                            {/* Drawer Header */}
                            <div className="flex items-center justify-between px-6 py-2 border-b border-slate-100 dark:border-slate-800">
                                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Profile</h2>
                                <button 
                                    onClick={() => setIsProfileOpen(false)}
                                    className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                >
                                    <X size={20} className="text-slate-500" />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-y-auto p-6 pb-[calc(env(safe-area-inset-bottom,0px)+2rem)]">
                                <SignInDropdown variant="inline" onNavigate={() => setIsProfileOpen(false)} />
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
};
