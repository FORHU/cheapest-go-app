"use client";

import React, { useState, useMemo } from 'react';
import { Sidebar } from '@/components/admin/Sidebar';
import { TopNav } from '@/components/admin/TopNav';
import { MobileAdminNav } from '@/components/admin/MobileAdminNav';
import { GlobalSparkle } from '@/components/ui/GlobalSparkle';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { User } from '@/types/auth';

export function AdminLayoutClient({
    children,
    profile
}: {
    children: React.ReactNode;
    profile?: Partial<User>;
}) {
    const { syncProfile } = useAuthStore();
    
    React.useEffect(() => {
        if (profile) {
            syncProfile(profile);
        }
    }, [profile, syncProfile]);

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const pathname = usePathname();

    const bannerConfig = useMemo(() => {
        const path = pathname.split('/').pop() || 'overview';
        const configs: Record<string, { title: string; subtitle: string; image: string }> = {
            overview: {
                title: 'Dashboard',
                subtitle: 'Platform Overview',
                image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80&w=1600'
            },
            bookings: {
                title: 'Bookings',
                subtitle: 'Platform Bookings and Supplier Tracking',
                image: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&q=80&w=1600'
            },
            customers: {
                title: 'Customers',
                subtitle: 'Manage customer profiles and booking history',
                image: 'https://images.unsplash.com/photo-1449034446853-66c86144b0ad?auto=format&fit=crop&q=80&w=1600'
            },
            analytics: {
                title: 'Analytics',
                subtitle: 'Detailed insights into platform performance and growth',
                image: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=1600'
            },
            suppliers: {
                title: 'Suppliers',
                subtitle: 'Manage property owners, hotels, and partners',
                image: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&q=80&w=1600'
            },
            users: {
                title: 'User Management',
                subtitle: 'Manage roles and access permissions',
                image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1600'
            },
            revenue: {
                title: 'Revenue Control',
                subtitle: 'Monitor markup performance and profitability',
                image: 'https://images.unsplash.com/photo-1554224155-1696413575b3?auto=format&fit=crop&q=80&w=1600'
            },
            settings: {
                title: 'Settings',
                subtitle: 'Configure platform-wide preferences and security',
                image: 'https://images.unsplash.com/photo-1454165833767-027ff33027ef?auto=format&fit=crop&q=80&w=1600'
            },
            communication: {
                title: 'Communication',
                subtitle: 'Email logs, delivery status, and retry history',
                image: 'https://images.unsplash.com/photo-1596526131083-e8c633c948d2?auto=format&fit=crop&q=80&w=1600'
            },
            destinations: {
                title: 'Destinations',
                subtitle: 'Manage featured destinations shown on the landing page',
                image: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&q=80&w=1600'
            },
            deals: {
                title: 'Deals & Vouchers',
                subtitle: 'Manage flight deals, weekend offers, and promo codes',
                image: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&q=80&w=1600'
            },
            'saved-trips': {
                title: 'Saved Trips',
                subtitle: 'View and manage customer saved flights and hotels',
                image: 'https://images.unsplash.com/photo-1503220317375-aaad61436b1b?auto=format&fit=crop&q=80&w=1600'
            },
            'price-alerts': {
                title: 'Price Alerts',
                subtitle: 'Monitor and manage customer flight price alerts',
                image: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&q=80&w=1600'
            },
            reviews: {
                title: 'Reviews',
                subtitle: 'Moderate hotel reviews across all properties',
                image: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&q=80&w=1600'
            },
            stripe: {
                title: 'Stripe',
                subtitle: 'Balance, payments, refunds, disputes and payouts',
                image: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&q=80&w=1600'
            },
            travelgatex: {
                title: 'TravelgateX · OTV',
                subtitle: 'Hotel provider integration health — WorldOTA / RateHawk via OTV access',
                image: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&q=80&w=1600'
            },
            mobile: {
                title: 'Mobile App',
                subtitle: 'Manage the CheapestGo React Native app — API key, bookings, config',
                image: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&q=80&w=1600'
            },
            duffel: {
                title: 'Duffel',
                subtitle: 'Live flight orders & integration health',
                image: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&q=80&w=1600'
            },
            airlines: {
                title: 'Airlines Directory',
                subtitle: 'Manage global carrier integrations and alliances',
                image: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&q=80&w=1600'
            }
        };
        return configs[path] || configs.overview;
    }, [pathname]);

    return (
        <div className="flex h-screen bg-alabaster dark:bg-obsidian text-slate-900 dark:text-white transition-colors duration-800 bg-grid-alabaster dark:bg-grid-obsidian bg-size-40px_40px overflow-hidden font-sans">
            <GlobalSparkle />

            {/* Mobile Sidebar overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm md:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <div className={`
        fixed inset-y-0 left-0 z-50 transform transition-all duration-300 ease-in-out md:relative md:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        ${isCollapsed ? 'md:w-24' : 'md:w-72'}
      `}>
                <Sidebar
                    onClose={() => setIsSidebarOpen(false)}
                    isCollapsed={isCollapsed}
                    onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
                />
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">
                <TopNav onMenuClick={() => setIsSidebarOpen(true)} isCollapsed={isCollapsed} />

                <main className="flex-1 overflow-y-auto custom-scrollbar">
                    {/* Page Banner */}
                    <div className="p-3 sm:p-6 lg:p-8 pb-0 lg:pb-0">
                        <div className="relative h-32 sm:h-64 w-full overflow-hidden rounded-2xl sm:rounded-3xl shadow-2xl">
                            <img
                                src={bannerConfig.image}
                                alt={bannerConfig.title}
                                className="w-full h-full object-cover transition-opacity duration-500"
                            />
                            <div className="absolute inset-0 bg-linear-to-b from-black/20 via-transparent to-black/60" />

                            <div className="absolute bottom-4 sm:bottom-8 left-4 sm:left-12 text-white">
                                <h2 className="text-xl sm:text-3xl font-black tracking-tighter drop-shadow-lg">
                                    {bannerConfig.title}
                                </h2>
                                <p className="text-[11px] sm:text-sm font-bold text-white/90 uppercase tracking-widest mt-0.5 sm:mt-1 drop-shadow-md hidden sm:block">
                                    {bannerConfig.subtitle}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Extra bottom padding on mobile so content clears the bottom nav */}
                    <div className="p-3 sm:p-6 lg:p-8 pb-24 sm:pb-8">
                        {children}
                    </div>
                </main>
            </div>

            {/* Mobile bottom navigation */}
            <MobileAdminNav />
        </div>
    );
}
