"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    LayoutDashboard, CalendarRange, Users, Banknote,
    MoreHorizontal, X, Shield, Building2, BarChart3,
    Settings, Mail, Plane, Bell, Star, MapPin, Tag, Bookmark, Smartphone, CreditCard, Globe,
} from 'lucide-react';

// ── Bottom bar tabs (most-used pages) ──────────────────────────────────────

const BOTTOM_TABS = [
    { label: 'Dashboard', href: '/admin/overview',   icon: LayoutDashboard },
    { label: 'Bookings',  href: '/admin/bookings',   icon: CalendarRange },
    { label: 'Customers', href: '/admin/customers',  icon: Users },
    { label: 'Revenue',   href: '/admin/revenue',    icon: Banknote },
    { label: 'More',      href: null,                icon: MoreHorizontal },
] as const;

// ── Full nav groups shown in the "More" sheet ───────────────────────────────

const ALL_GROUPS = [
    {
        title: 'Menu',
        items: [
            { label: 'Dashboard',  href: '/admin/overview',   icon: LayoutDashboard },
            { label: 'Bookings',   href: '/admin/bookings',   icon: CalendarRange },
            { label: 'Customers',  href: '/admin/customers',  icon: Users },
            { label: 'Users',      href: '/admin/users',      icon: Shield },
            { label: 'Suppliers',  href: '/admin/suppliers',  icon: Building2 },
            { label: 'Revenue',    href: '/admin/revenue',    icon: Banknote },
        ],
    },
    {
        title: 'Content',
        items: [
            { label: 'Destinations',    href: '/admin/destinations', icon: MapPin },
            { label: 'Deals & Vouchers',href: '/admin/deals',        icon: Tag },
            { label: 'Saved Trips',     href: '/admin/saved-trips',  icon: Bookmark },
        ],
    },
    {
        title: 'General',
        items: [
            { label: 'Communication', href: '/admin/communication', icon: Mail },
            { label: 'Analytics',     href: '/admin/analytics',     icon: BarChart3 },
            { label: 'Price Alerts',  href: '/admin/price-alerts',  icon: Bell },
            { label: 'Reviews',       href: '/admin/reviews',       icon: Star },
            { label: 'Settings',      href: '/admin/settings',      icon: Settings },
        ],
    },
    {
        title: 'Integrations',
        items: [
            { label: 'Stripe',      href: '/admin/stripe',       icon: CreditCard },
            { label: 'Duffel',      href: '/admin/duffel',       icon: Plane },
            { label: 'TravelgateX', href: '/admin/travelgatex',  icon: Globe },
            { label: 'Mobile App',  href: '/admin/mobile',       icon: Smartphone },
        ],
    },
];

// ── Component ───────────────────────────────────────────────────────────────

export function MobileAdminNav() {
    const pathname = usePathname();
    const [sheetOpen, setSheetOpen] = useState(false);

    return (
        <>
            {/* Bottom tab bar — visible on mobile only */}
            <nav className="fixed bottom-0 inset-x-0 z-50 md:hidden bg-white/90 dark:bg-obsidian/95 backdrop-blur-xl border-t border-slate-100 dark:border-white/10 pb-safe">
                <div className="flex items-stretch h-16">
                    {BOTTOM_TABS.map((tab) => {
                        const Icon = tab.icon;
                        const isMore = tab.href === null;
                        const isActive = !isMore && pathname === tab.href;

                        if (isMore) {
                            return (
                                <button
                                    key="more"
                                    onClick={() => setSheetOpen(true)}
                                    className={`flex-1 flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-blue-600 transition-colors ${sheetOpen ? 'text-blue-600' : ''}`}
                                >
                                    <Icon size={22} />
                                    <span className="text-[10px] font-bold">More</span>
                                </button>
                            );
                        }

                        return (
                            <Link key={tab.href} href={tab.href!} className="flex-1">
                                <div className={`h-full flex flex-col items-center justify-center gap-1 transition-colors ${isActive ? 'text-blue-600' : 'text-slate-400 hover:text-blue-600'}`}>
                                    {isActive && (
                                        <motion.div
                                            layoutId="mobile-tab-indicator"
                                            className="absolute top-0 h-0.5 w-8 bg-blue-600 rounded-full"
                                        />
                                    )}
                                    <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                                    <span className={`text-[10px] font-bold ${isActive ? 'text-blue-600' : ''}`}>{tab.label}</span>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </nav>

            {/* "More" sheet — slides up from bottom */}
            <AnimatePresence>
                {sheetOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            key="backdrop"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="fixed inset-0 z-60 bg-slate-900/50 backdrop-blur-sm md:hidden"
                            onClick={() => setSheetOpen(false)}
                        />

                        {/* Sheet */}
                        <motion.div
                            key="sheet"
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                            className="fixed bottom-0 inset-x-0 z-70 bg-white dark:bg-obsidian rounded-t-3xl shadow-2xl pb-safe md:hidden max-h-[85vh] overflow-y-auto thin-scrollbar"
                        >
                            {/* Handle */}
                            <div className="flex items-center justify-between px-6 pt-4 pb-2 sticky top-0 bg-white dark:bg-obsidian border-b border-slate-100 dark:border-white/5">
                                <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/20 mx-auto absolute left-1/2 -translate-x-1/2 top-2" />
                                <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mt-3">Navigation</span>
                                <button onClick={() => setSheetOpen(false)} className="mt-3 p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Nav groups */}
                            <div className="px-4 py-4 space-y-6">
                                {ALL_GROUPS.map((group) => (
                                    <div key={group.title}>
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-2 mb-2">{group.title}</p>
                                        <div className="grid grid-cols-3 gap-2">
                                            {group.items.map((item) => {
                                                const Icon = item.icon;
                                                const isActive = pathname === item.href;
                                                return (
                                                    <Link
                                                        key={item.href}
                                                        href={item.href}
                                                        onClick={() => setSheetOpen(false)}
                                                        className={`flex flex-col items-center gap-2 p-3 rounded-2xl text-center transition-all ${
                                                            isActive
                                                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                                                                : 'bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-blue-600/10 hover:text-blue-600'
                                                        }`}
                                                    >
                                                        <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
                                                        <span className="text-[10px] font-bold leading-tight">{item.label}</span>
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Extra bottom padding so content isn't behind the bottom bar */}
                            <div className="h-20" />
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}
