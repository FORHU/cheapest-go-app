'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, CalendarCheck, CalendarRange, ChevronRight, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * The portal's sidebar menu: requests, tee sheet, and the way back to the site.
 *
 * It wears the admin sidebar's clothes on purpose (same active pill, left marker and collapsed
 * rail, as the Support Desk's menu does) and is short on purpose: a course sees only what it
 * can act on.
 */

interface CourseSideNavProps {
    pathname: string;
    waiting: number;
    isCollapsed?: boolean;
    onNavigate?: () => void;
}

export const COURSE_NAV = [
    { href: '/course', key: 'navRequests', icon: CalendarCheck, exact: true },
    { href: '/course/tee-sheet', key: 'navTeeSheet', icon: CalendarRange, exact: false },
    { href: '/course/profile', key: 'navProfile', icon: FileText, exact: false },
] as const;

export function CourseSideNav({ pathname, waiting, isCollapsed = false, onNavigate }: CourseSideNavProps) {
    const t = useTranslations('golf.staff.sheet');

    return (
        <nav aria-label={t('navLabel')} className="space-y-0.5">
            {COURSE_NAV.map(item => {
                const isCurrent = item.exact ? pathname === item.href : pathname.startsWith(item.href);
                const showsQueue = item.href === '/course' && waiting > 0;
                const label = t(item.key);
                const collapsedName = showsQueue ? `${label}, ${t('navWaiting', { count: waiting })}` : label;

                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={isCurrent ? 'page' : undefined}
                        aria-label={isCollapsed ? collapsedName : undefined}
                        title={isCollapsed ? collapsedName : undefined}
                    >
                        <motion.div
                            className={`relative group flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-4'} py-3 cursor-pointer transition-all duration-300 ${
                                isCurrent ? 'text-white' : 'text-slate-500 hover:text-blue-600'
                            }`}
                        >
                            {isCurrent && (
                                <motion.div layoutId="course-marker" className="absolute left-0 w-1.5 h-6 bg-blue-500 rounded-r-md" />
                            )}
                            {isCurrent && (
                                <motion.div
                                    layoutId="course-active"
                                    className="absolute inset-x-2 inset-y-1 bg-blue-600 rounded-xl -z-10 shadow-lg shadow-blue-600/20"
                                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                />
                            )}

                            <item.icon
                                size={20}
                                className={`${isCurrent ? 'text-white' : 'text-slate-400 group-hover:text-blue-500'} transition-colors shrink-0`}
                            />

                            {isCollapsed ? (
                                showsQueue && (
                                    <span aria-hidden className="absolute top-2 right-4 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-obsidian" />
                                )
                            ) : (
                                <>
                                    <span className="text-sm font-bold tracking-tight flex-1">{label}</span>
                                    {showsQueue && (
                                        <span
                                            aria-label={t('navWaiting', { count: waiting })}
                                            className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                                                isCurrent
                                                    ? 'bg-white/20 text-white'
                                                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                                            }`}
                                        >
                                            {waiting}
                                        </span>
                                    )}
                                    {isCurrent && !showsQueue && <ChevronRight size={14} className="ml-auto opacity-60" />}
                                </>
                            )}
                        </motion.div>
                    </Link>
                );
            })}

            <Link
                href="/golf"
                onClick={onNavigate}
                aria-label={isCollapsed ? t('navBackToSite') : undefined}
                title={isCollapsed ? t('navBackToSite') : undefined}
                className={`mt-4 flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-4'} py-3 text-sm font-bold text-slate-500 transition-colors hover:text-blue-600`}
            >
                <ArrowLeft size={20} className="shrink-0 text-slate-400" />
                {!isCollapsed && <span className="tracking-tight">{t('navBackToSite')}</span>}
            </Link>
        </nav>
    );
}
