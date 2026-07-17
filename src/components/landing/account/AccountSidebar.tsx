"use client";

import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronRight, HelpCircle, Mail } from 'lucide-react';
import type { User } from '@/types/auth';
import { AccountSidebarItem } from './AccountSidebarItem';
import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useUserCurrency } from '@/stores/searchStore';
import { getCurrencySymbol } from '@/lib/currency';

interface AccountSidebarProps {
    user: User;
    activeSection: string;
    onSectionChange: (section: string) => void;
    onSignOut: () => void;
    sidebarItems: Array<{
        id: string;
        icon: React.ReactNode;
        title: string;
        description: string;
    }>;
}

export const AccountSidebar: React.FC<AccountSidebarProps> = ({
    user,
    activeSection,
    onSectionChange,
    onSignOut,
    sidebarItems,
}) => {
    const t = useTranslations('account');

    const [showPointsInfo, setShowPointsInfo] = useState(false);
    const pointsInfoId = useId();
    const pointsInfoRef = useRef<HTMLDivElement>(null);

    // Points value uses the currency selected in the navbar. Gate on mount so the
    // server render (store default) and first client render match before the
    // persisted currency is applied — avoids a hydration mismatch.
    const userCurrency = useUserCurrency();
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const pointsSymbol = getCurrencySymbol(mounted ? userCurrency : 'KRW');

    // Close the points tooltip on outside click / Escape.
    useEffect(() => {
        if (!showPointsInfo) return;
        const onDown = (e: MouseEvent) => {
            if (pointsInfoRef.current && !pointsInfoRef.current.contains(e.target as Node)) {
                setShowPointsInfo(false);
            }
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setShowPointsInfo(false);
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [showPointsInfo]);

    return (
        <div className="w-full lg:w-80 flex-shrink-0">
            {/* User Card */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/10 p-6 mb-4">
                {/* User Greeting */}
                <div className="mb-6">
                    <h1 className="text-[clamp(1.125rem,4vw,1.5rem)] font-bold text-slate-900 dark:text-white">
                        {t('sidebar.greeting', { name: user.firstName || '' })}
                    </h1>
                    <p className="text-[clamp(0.75rem,1.5vw,0.875rem)] text-slate-500 dark:text-slate-400">{user.email}</p>
                </div>

                {/* Membership Badge */}
                <div className="mb-6">
                    <span className="inline-block px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded-full">
                        {t('sidebar.membershipTier')}
                    </span>
                </div>

                {/* Points Value */}
                <div className="mb-4" ref={pointsInfoRef}>
                    <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mb-1">
                        {t('sidebar.pointsValue')}
                        <div className="relative flex items-center">
                            <button
                                type="button"
                                onClick={() => setShowPointsInfo((v) => !v)}
                                aria-label={t('sidebar.pointsValue')}
                                aria-expanded={showPointsInfo}
                                aria-describedby={showPointsInfo ? pointsInfoId : undefined}
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <HelpCircle size={12} />
                            </button>
                            {showPointsInfo && (
                                <div
                                    id={pointsInfoId}
                                    role="tooltip"
                                    className="absolute left-1/2 top-full z-20 mt-2 w-60 -translate-x-1/2 rounded-lg bg-slate-900 dark:bg-slate-800 p-3 text-xs font-normal leading-relaxed text-white shadow-xl border border-white/10"
                                >
                                    {t('sidebar.pointsInfo')}
                                </div>
                            )}
                        </div>
                    </div>
                    <p className="text-[clamp(1.125rem,4vw,1.5rem)] font-bold text-slate-900 dark:text-white">{pointsSymbol} 0.00</p>
                </div>

                <button className="w-full text-sm text-blue-600 dark:text-blue-400 hover:underline text-left flex items-center justify-between py-2">
                    {t('sidebar.viewRewardsActivity')}
                    <ChevronRight size={16} />
                </button>
            </div>

            {/* Email Promo Card */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl border border-blue-100 dark:border-blue-800/50 p-5 mb-4">
                <div className="flex items-start gap-3 mb-4">
                    <div className="p-2 bg-white dark:bg-white/10 rounded-lg">
                        <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                        <p className="font-medium text-slate-900 dark:text-white text-sm">{t('sidebar.promoTitle')}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{t('sidebar.promoSubtitle')}</p>
                    </div>
                </div>
                <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
                    {t('sidebar.getEmails')}
                </button>
            </div>

            {/* Navigation Menu */}
            <div className="space-y-2">
                {sidebarItems.map((item) => (
                    <AccountSidebarItem
                        key={item.id}
                        icon={item.icon}
                        title={item.title}
                        description={item.description}
                        active={activeSection === item.id}
                        onClick={() => onSectionChange(item.id)}
                    />
                ))}
            </div>

            {/* Sign Out */}
            <button
                onClick={onSignOut}
                className="w-full mt-6 flex items-center justify-center gap-2 py-3 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium text-sm transition-colors"
            >
                <LogOut size={18} />
                {t('sidebar.signOut')}
            </button>

            {/* Partner Info */}
            <div className="mt-6 pt-6 border-t border-slate-200 dark:border-white/10">
                <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
                    {t('sidebar.partnerInfo')}
                </p>
            </div>
        </div>
    );
};
