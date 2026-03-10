"use client";

import React, { useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    User,
    Bell,
    Shield,
    HelpCircle,
    ArrowLeft
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { AccountSidebar, AccountMainContent as AccountMain } from '@/components/landing';

const VALID_SECTIONS = ['profile', 'communications', 'security', 'help'] as const;

interface AccountContentProps {
    initialUser: {
        id: string;
        email: string;
        user_metadata: Record<string, any>;
    };
}

export function AccountContent({ initialUser }: AccountContentProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user: storeUser, logout } = useAuthStore();

    const rawSection = searchParams?.get('section');
    const activeSection = VALID_SECTIONS.includes(rawSection as any) ? rawSection! : 'profile';

    const setActiveSection = useCallback((section: string) => {
        const params = new URLSearchParams(searchParams?.toString() || '');
        if (section === 'profile') {
            params.delete('section');
        } else {
            params.set('section', section);
        }
        router.replace(`?${params.toString()}`);
    }, [router, searchParams]);

    // Use store user if available (real-time), otherwise fall back to server-provided data
    const user = storeUser || {
        id: initialUser.id,
        email: initialUser.email,
        firstName: initialUser.user_metadata?.first_name || initialUser.user_metadata?.firstName || '',
        lastName: initialUser.user_metadata?.last_name || initialUser.user_metadata?.lastName || '',
        avatar: initialUser.user_metadata?.avatar_url || initialUser.user_metadata?.picture || '',
    };

    // Sidebar items - memoized to avoid recreating on each render
    const sidebarItems = useMemo(() => [
        { id: 'profile', icon: <User size={20} />, title: 'Profile', description: 'View and edit your personal details' },
        { id: 'communications', icon: <Bell size={20} />, title: 'Communications', description: 'Control which notifications you get' },
        { id: 'security', icon: <Shield size={20} />, title: 'Security', description: 'Update your password' },
        { id: 'help', icon: <HelpCircle size={20} />, title: 'Help and feedback', description: 'Get customer support' },
    ], []);

    const handleSignOut = async () => {
        await logout();
        window.location.href = '/';
    };

    return (
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
            {/* Back Button */}
            <Link
                href="/"
                className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors mb-6"
            >
                <ArrowLeft className="h-4 w-4" />
                Back to home
            </Link>

            <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 lg:gap-8">
                {/* Left Sidebar */}
                <AccountSidebar
                    user={user}
                    activeSection={activeSection}
                    onSectionChange={setActiveSection}
                    onSignOut={handleSignOut}
                    sidebarItems={sidebarItems}
                />

                {/* Main Content */}
                <AccountMain user={user} activeSection={activeSection} />
            </div>
        </main>
    );
}
