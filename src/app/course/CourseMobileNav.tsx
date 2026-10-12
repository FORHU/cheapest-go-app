'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, CalendarCheck, CalendarRange } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** The portal on a phone: the admin's bottom bar with only the portal in it. */
export function CourseMobileNav({ pathname, waiting }: { pathname: string; waiting: number }) {
    const t = useTranslations('golf.staff.sheet');
    const tabs = [
        { href: '/course', label: t('navRequests'), icon: CalendarCheck, active: pathname === '/course' },
        { href: '/course/tee-sheet', label: t('navTeeSheet'), icon: CalendarRange, active: pathname.startsWith('/course/tee-sheet') },
        { href: '/golf', label: t('navBackToSite'), icon: ArrowLeft, active: false },
    ];

    return (
        <nav
            aria-label={t('navLabel')}
            className="fixed bottom-0 inset-x-0 z-50 md:hidden bg-white/90 dark:bg-obsidian/95 backdrop-blur-xl border-t border-slate-100 dark:border-white/10 pb-safe"
        >
            <div className="flex items-stretch h-16">
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <Link key={tab.href} href={tab.href} aria-current={tab.active ? 'page' : undefined} className="flex-1">
                            <div className={`relative h-full flex flex-col items-center justify-center gap-1 transition-colors ${
                                tab.active ? 'text-blue-600' : 'text-slate-400 hover:text-blue-600'
                            }`}>
                                {tab.active && (
                                    <motion.div layoutId="course-tab-indicator" className="absolute top-0 h-0.5 w-8 bg-blue-600 rounded-full" />
                                )}
                                <div className="relative">
                                    <Icon size={22} strokeWidth={tab.active ? 2.5 : 1.8} />
                                    {tab.href === '/course' && waiting > 0 && (
                                        <span
                                            aria-label={t('navWaiting', { count: waiting })}
                                            className="absolute -top-1.5 -right-2 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center"
                                        >
                                            {waiting}
                                        </span>
                                    )}
                                </div>
                                <span className="text-[10px] font-bold tracking-tight">{tab.label}</span>
                            </div>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
