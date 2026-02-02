"use client";

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    User,
    Bell,
    Shield,
    HelpCircle,
    ArrowLeft
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { Header, AccountSidebar, AccountMainContent } from '@/components/landing';

export default function AccountSettingsPage() {
    const router = useRouter();
    const { user, logout } = useAuthStore();
    const [activeSection, setActiveSection] = useState('profile');

    // Sidebar items - memoized to avoid recreating on each render
    const sidebarItems = useMemo(() => [
        { id: 'profile', icon: <User size={20} />, title: 'Profile', description: 'View and edit your personal details' },
        { id: 'communications', icon: <Bell size={20} />, title: 'Communications', description: 'Control which notifications you get' },
        { id: 'security', icon: <Shield size={20} />, title: 'Security', description: 'Update your password' },
        { id: 'help', icon: <HelpCircle size={20} />, title: 'Help and feedback', description: 'Get customer support' },
    ], []);

    const handleSignOut = () => {
        logout();
        router.push('/');
    };

    // Redirect if not logged in
    if (!user) {
        return (
            <div className="min-h-screen flex flex-col">
                <Header />
                <main className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                            Please sign in to view your account
                        </h2>
                        <Link
                            href="/login"
                            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-full transition-colors"
                        >
                            Sign in
                        </Link>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col">
            <Header />

            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
                {/* Back Button */}
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors mb-6"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to home
                </Link>

                <div className="flex flex-col lg:flex-row gap-8">
                    {/* Left Sidebar */}
                    <AccountSidebar
                        user={user}
                        activeSection={activeSection}
                        onSectionChange={setActiveSection}
                        onSignOut={handleSignOut}
                        sidebarItems={sidebarItems}
                    />

                    {/* Main Content */}
                    <AccountMainContent user={user} activeSection={activeSection} />
                </div>
            </main>
        </div>
    );
}
