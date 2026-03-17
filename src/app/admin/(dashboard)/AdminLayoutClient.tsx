"use client";

import React, { useState, useMemo } from 'react';
import { Sidebar } from '@/components/admin/Sidebar';
import { TopNav } from '@/components/admin/TopNav';
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
            settings: {
                title: 'Settings',
                subtitle: 'Configure platform-wide preferences and security',
                image: 'https://images.unsplash.com/photo-1454165833767-027ff33027ef?auto=format&fit=crop&q=80&w=1600'
            }
        };
        return configs[path] || configs.overview;
    }, [pathname]);

    return (
        <div className="flex h-screen bg-alabaster dark:bg-obsidian text-slate-900 dark:text-white transition-colors duration-800 bg-grid-alabaster dark:bg-grid-obsidian bg-[length:40px_40px] overflow-hidden font-sans">
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
                    {/* Page Banner Container with Padding for Rounded Corners */}
                    <div className="p-4 sm:p-6 lg:p-8 pb-0 lg:pb-0">
                        <div className="relative h-48 sm:h-64 w-full overflow-hidden rounded-3xl shadow-2xl">
                            <img
                                src={bannerConfig.image}
                                alt={bannerConfig.title}
                                className="w-full h-full object-cover transition-opacity duration-500"
                            />
                            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60" />

                            <div className="absolute bottom-8 left-8 sm:left-12 text-white">
                                <h2 className="text-2xl sm:text-3xl font-black tracking-tighter drop-shadow-lg">
                                    {bannerConfig.title}
                                </h2>
                                <p className="text-sm font-bold text-white/90 uppercase tracking-widest mt-1 drop-shadow-md">
                                    {bannerConfig.subtitle}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 sm:p-6 lg:p-8">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
