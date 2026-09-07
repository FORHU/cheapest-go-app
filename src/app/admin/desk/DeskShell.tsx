'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Plane } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TopNav } from '@/components/admin/TopNav';
import { GlobalSparkle } from '@/components/ui/GlobalSparkle';
import { useSupportWaiting } from '@/components/admin/useSupportWaiting';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types/auth';
import { DeskNav } from './DeskNav';
import { DeskMobileNav } from './DeskMobileNav';
import { deskBanner } from './banner';

/**
 * The desk's chrome.
 *
 * Deliberately the same frame as the full admin — the grid background, the collapsing
 * sidebar, the top bar, the photographic banner — because an Agent who is also an admin
 * moves between the two consoles all day, and a plainer desk would read as an unfinished
 * corner of the product rather than a workspace built for one job.
 *
 * What is not copied is the contents of the navigation. The desk holds an inbox, the
 * hours, and the way back; the admin's nineteen other sections stay in the admin. Design
 * copied, menu not — that distinction is the whole design.
 */

const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'CheapestGo';

function Wordmark({ isCollapsed }: { isCollapsed: boolean }) {
    return (
        <Link
            href="/"
            className={`p-8 flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} hover:opacity-90 transition-opacity`}
        >
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/30 shrink-0">
                <Plane className="text-white" size={24} />
            </div>
            {!isCollapsed && (
                <h1 className="text-xl font-black tracking-tighter text-slate-900 dark:text-white whitespace-nowrap">
                    {BRAND_NAME === 'CheapestGo'
                        ? <>Cheapest Go<span className="text-blue-600">.</span></>
                        : BRAND_NAME === 'GeomeeGo'
                        ? <>Geome<span className="text-blue-600">Go</span>.</>
                        : <>{BRAND_NAME}<span className="text-blue-600">.</span></>}
                </h1>
            )}
        </Link>
    );
}

export function DeskShell({
    children,
    profile,
}: {
    children: React.ReactNode;
    profile?: Partial<User>;
}) {
    const { syncProfile } = useAuthStore();

    React.useEffect(() => {
        if (profile) syncProfile(profile);
    }, [profile, syncProfile]);

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const pathname = usePathname();
    const waiting = useSupportWaiting();
    const banner = deskBanner(pathname);

    return (
        <div className="flex h-screen bg-alabaster dark:bg-obsidian text-slate-900 dark:text-white transition-colors duration-800 bg-grid-alabaster dark:bg-grid-obsidian bg-size-40px_40px overflow-hidden font-sans">
            <GlobalSparkle />

            {/* Mobile sidebar overlay */}
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
                <aside
                    className={`${isCollapsed ? 'w-24' : 'w-72'} h-screen flex flex-col bg-white dark:bg-obsidian border-r border-slate-100 dark:border-white/5 relative z-50 transition-all duration-300`}
                >
                    <Wordmark isCollapsed={isCollapsed} />

                    <div className="flex-1 overflow-y-auto px-4 py-4 thin-scrollbar">
                        {!isCollapsed && (
                            <h4 className="px-4 py-1 mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400/80">
                                Support desk
                            </h4>
                        )}

                        <DeskNav
                            pathname={pathname}
                            waiting={waiting}
                            isCollapsed={isCollapsed}
                            onNavigate={() => setIsSidebarOpen(false)}
                        />
                    </div>

                    <div className="p-6 mt-auto border-t border-slate-100 dark:border-white/5 flex items-center justify-center">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setIsCollapsed(v => !v)}
                            aria-label={isCollapsed ? 'Expand the menu' : 'Collapse the menu'}
                            className="w-10 h-10 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-600/10 transition-all hidden md:flex"
                        >
                            <div className={`transition-transform duration-300 ${isCollapsed ? '' : 'rotate-180'}`}>
                                <ChevronRight size={20} />
                            </div>
                        </Button>
                    </div>
                </aside>
            </div>

            {/* Main content */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">
                <TopNav variant="desk" onMenuClick={() => setIsSidebarOpen(true)} isCollapsed={isCollapsed} />

                <main className="flex-1 overflow-y-auto custom-scrollbar">
                    {/* Page banner */}
                    <div className="p-3 sm:p-6 lg:p-8 pb-0 lg:pb-0">
                        <div className="relative h-32 sm:h-64 w-full overflow-hidden rounded-2xl sm:rounded-3xl shadow-2xl">
                            <img
                                src={banner.image}
                                alt={banner.title}
                                className="w-full h-full object-cover transition-opacity duration-500"
                            />
                            <div className="absolute inset-0 bg-linear-to-b from-black/20 via-transparent to-black/60" />

                            <div className="absolute bottom-4 sm:bottom-8 left-4 sm:left-12 text-white">
                                <h2 className="text-xl sm:text-3xl font-black tracking-tighter drop-shadow-lg">
                                    {banner.title}
                                </h2>
                                <p className="text-[11px] sm:text-sm font-bold text-white/90 uppercase tracking-widest mt-0.5 sm:mt-1 drop-shadow-md hidden sm:block">
                                    {banner.subtitle}
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

            <DeskMobileNav pathname={pathname} waiting={waiting} />
        </div>
    );
}
