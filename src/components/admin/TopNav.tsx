"use client";

import React from 'react';
import {
    Menu,
    Search,
    Bell,
    User,
    Sun,
    Moon,
    Command,
    LogOut
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/components/context/ThemeContext';

import { useAuthStore } from '@/stores/authStore';

import { useRouter } from 'next/navigation';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogTrigger,
    DialogClose,
} from '@/components/ui/Dialog';

interface TopNavProps {
    onMenuClick?: () => void;
}

export function TopNav({ onMenuClick }: TopNavProps) {
    const { theme, toggleTheme } = useTheme();
    const router = useRouter();
    const user = useAuthStore((s) => s.user);
    const logout = useAuthStore((s) => s.logout);
    const [isLogoutOpen, setIsLogoutOpen] = React.useState(false);

    const handleLogout = async () => {
        try {
            await logout();
            setIsLogoutOpen(false);
            // Use window.location.href for a full refresh to clear all caches/state
            window.location.href = '/login';
        } catch (error) {
            console.error('Logout failed:', error);
        }
    };

    return (
        <header className="h-20 flex items-center justify-between px-6 sm:px-8 border-b border-slate-100 dark:border-white/5 bg-transparent relative z-20">
            {/* Left: Menu & Search */}
            <div className="flex items-center gap-6 flex-1 bg-white/10">
                <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden text-slate-500"
                    onClick={onMenuClick}
                >
                    <Menu size={20} />
                </Button>

                <div className="relative max-w-md w-full hidden sm:block">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                        <Search size={16} />
                    </div>
                    <input
                        type="text"
                        placeholder="Search tasks..."
                        className="w-full bg-white dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl py-2.5 pl-11 pr-12 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-slate-400"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden lg:flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 dark:bg-white/10 rounded-lg text-[10px] font-bold text-slate-400">
                        <Command size={10} />
                        <span>F</span>
                    </div>
                </div>
            </div>

            {/* Right: Actions & Profile */}
            <div className="flex items-center gap-2 sm:gap-4">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleTheme}
                    className="w-10 h-10 rounded-xl text-slate-500 hover:bg-white dark:hover:bg-white/5 border border-transparent hover:border-slate-100 dark:hover:border-white/10"
                >
                    {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                </Button>

                <div className="relative">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="w-10 h-10 rounded-xl text-slate-500 hover:bg-white dark:hover:bg-white/5 border border-transparent hover:border-slate-100 dark:hover:border-white/10"
                    >
                        <Bell size={20} />
                    </Button>
                    <div className="absolute top-2.5 right-2.5 w-2 h-2 bg-blue-500 rounded-full border-2 border-white dark:border-obsidian" />
                </div>

                <div className="h-10 w-[1px] bg-slate-100 dark:bg-white/5 mx-2 hidden sm:block" />

                <div className="flex items-center gap-3 pl-2 cursor-pointer group">
                    <div className="text-right hidden sm:block">
                        <p className="text-sm font-black text-slate-900 dark:text-white leading-none group-hover:text-blue-600 transition-colors">
                            {user ? `${user.firstName} ${user.lastName}` : 'Guest User'}
                        </p>
                        <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider">
                            {user?.role === 'admin' ? 'Administrator' : 'Standard User'}
                        </p>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold shadow-lg shadow-blue-600/20 ring-2 ring-white dark:ring-white/10 ring-offset-2 dark:ring-offset-transparent overflow-hidden transition-transform group-hover:scale-105">
                        {user?.avatar ? (
                            <img src={user.avatar} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                            <User size={20} />
                        )}
                    </div>
                </div>

                <div className="h-10 w-[1px] bg-slate-100 dark:bg-white/5 mx-2 hidden sm:block" />

                <Dialog open={isLogoutOpen} onOpenChange={setIsLogoutOpen}>
                    <DialogTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="w-10 h-10 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                            title="Sign Out"
                        >
                            <LogOut size={20} />
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[400px]">
                        <DialogHeader>
                            <DialogTitle>Confirm Sign Out</DialogTitle>
                            <DialogDescription>
                                Are you sure you want to sign out? You will need to log in again to access the admin dashboard.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter className="sm:justify-start gap-3 mt-6">
                            <Button
                                variant="destructive"
                                onClick={handleLogout}
                                className="rounded-2xl font-black px-6"
                            >
                                Sign Out
                            </Button>
                            <DialogClose asChild>
                                <Button
                                    variant="ghost"
                                    className="rounded-2xl font-bold border border-slate-200 dark:border-white/10"
                                >
                                    Cancel
                                </Button>
                            </DialogClose>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </header>
    );
}
