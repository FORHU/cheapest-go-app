"use client";

import React from 'react';
import {
    Menu,
    Search,
    Bell,
    User,
    Sun,
    Moon,
    Command
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/components/context/ThemeContext';

interface TopNavProps {
    onMenuClick?: () => void;
}

export function TopNav({ onMenuClick }: TopNavProps) {
    const { theme, toggleTheme } = useTheme();

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
                        <p className="text-sm font-black text-slate-900 dark:text-white leading-none group-hover:text-blue-600 transition-colors">Billy Admin</p>
                        <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider">Administrator</p>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold shadow-lg shadow-blue-600/20 ring-2 ring-white dark:ring-white/10 ring-offset-2 dark:ring-offset-transparent overflow-hidden transition-transform group-hover:scale-105">
                        <img src="https://ui-avatars.com/api/?name=Billy+Admin&background=2563eb&color=fff" alt="Profile" className="w-full h-full object-cover" />
                    </div>
                </div>
            </div>
        </header>
    );
}
