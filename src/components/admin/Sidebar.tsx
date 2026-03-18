"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import {
    LayoutDashboard,
    CalendarRange,
    Users,
    Building2,
    BarChart3,
    Settings,
    LogOut,
    Plane,
    ChevronRight,
    Smartphone,
    Mail,
    Shield
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface NavItem {
    label: string;
    href: string;
    icon: any;
}

const navItems = [
    { label: 'Dashboard', href: '/admin/overview', icon: LayoutDashboard },
    { label: 'Bookings', href: '/admin/bookings', icon: CalendarRange },
    { label: 'Customers', href: '/admin/customers', icon: Users },
    { label: 'Users', href: '/admin/users', icon: Shield },
    { label: 'Suppliers', href: '/admin/suppliers', icon: Building2 },
    { label: 'Communication', href: '/admin/communication', icon: Mail },
    { label: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
    { label: 'Settings', href: '/admin/settings', icon: Settings },
];

interface SidebarProps {
    onClose?: () => void;
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
}

export function Sidebar({ onClose, isCollapsed, onToggleCollapse }: SidebarProps) {
    const pathname = usePathname();

    const NavigationGroup = ({ title, items }: { title: string, items: any[] }) => (
        <div className="space-y-4">
            {!isCollapsed && (
                <h4 className="px-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400/80">
                    {title}
                </h4>
            )}
            <div className="space-y-1">
                {items.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link key={item.href} href={item.href} onClick={onClose}>
                            <motion.div
                                title={isCollapsed ? item.label : undefined}
                                className={`relative group flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-4'} py-3 cursor-pointer transition-all duration-300 ${isActive
                                    ? 'text-white'
                                    : 'text-slate-500 hover:text-blue-600'
                                    }`}
                            >
                                {/* Vertical Marker */}
                                {isActive && (
                                    <motion.div
                                        layoutId="sidebar-marker"
                                        className="absolute left-0 w-1.5 h-6 bg-blue-500 rounded-r-md"
                                    />
                                )}

                                {/* Active Background Pill */}
                                {isActive && (
                                    <motion.div
                                        layoutId="sidebar-active"
                                        className={`absolute ${isCollapsed ? 'inset-x-2' : 'inset-x-2'} inset-y-1 bg-blue-600 rounded-xl -z-10 shadow-lg shadow-blue-600/20`}
                                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                    />
                                )}

                                <item.icon size={20} className={`${isActive ? 'text-white' : 'text-slate-400 group-hover:text-blue-500'} transition-colors`} />

                                {!isCollapsed && (
                                    <>
                                        <span className="text-sm font-bold tracking-tight">{item.label}</span>
                                        {isActive && (
                                            <ChevronRight size={14} className="ml-auto opacity-60" />
                                        )}
                                    </>
                                )}
                            </motion.div>
                        </Link>
                    );
                })}
            </div>
        </div>
    );

    return (
        <aside className={`${isCollapsed ? 'w-24' : 'w-72'} h-screen flex flex-col bg-white dark:bg-obsidian border-r border-slate-100 dark:border-white/5 relative z-50 transition-all duration-300`}>
            {/* Logo Section */}
            <div className={`p-8 flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/30 shrink-0">
                    <Plane className="text-white" size={24} />
                </div>
                {!isCollapsed && (
                    <h1 className="text-xl font-black tracking-tighter text-slate-900 dark:text-white whitespace-nowrap">
                        Cheapest Go<span className="text-blue-600">.</span>
                    </h1>
                )}
            </div>

            {/* Navigation Sections */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-10 thin-scrollbar">
                <NavigationGroup title="Menu" items={navItems.slice(0, 6)} />
                <NavigationGroup title="General" items={navItems.slice(6)} />

                {/* Sidebar Widget (Download App) - Hidden when collapsed */}
                {!isCollapsed && (
                    <div className="mt-10 px-4">
                        <div className="bg-slate-900 rounded-3xl p-6 relative overflow-hidden group">
                            {/* Decorative Patterns */}
                            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/20 blur-3xl rounded-full -mr-16 -mt-16" />
                            <div className="absolute bottom-0 left-0 w-24 h-24 bg-blue-500/10 blur-3xl rounded-full -ml-12 -mb-12" />

                            <div className="relative z-10 space-y-4">
                                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-emerald-400">
                                    <Smartphone size={16} />
                                </div>
                                <h5 className="text-xs font-bold text-white uppercase tracking-widest">Mobile App</h5>
                                <p className="text-[11px] text-slate-300 font-medium leading-relaxed">
                                    Experience Donezo on your mobile device.
                                </p>
                                <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-500 text-white border-0 text-[10px] font-black uppercase tracking-wider rounded-xl py-3 h-auto shadow-lg shadow-blue-600/20">
                                    Download
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Actions: Collapse Toggle */}
            <div className="p-6 mt-auto border-t border-slate-100 dark:border-white/5 flex items-center justify-center">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onToggleCollapse}
                    className="w-10 h-10 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-600/10 transition-all hidden md:flex"
                >
                    <div className={`transition-transform duration-300 ${isCollapsed ? '' : 'rotate-180'}`}>
                        <ChevronRight size={20} />
                    </div>
                </Button>
            </div>
        </aside>
    );
}
