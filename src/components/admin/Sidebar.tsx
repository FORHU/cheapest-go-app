"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    LayoutDashboard,
    CalendarRange,
    Users,
    Building2,
    BarChart3,
    Settings,
    Plane,
    Globe,
    ChevronRight,
    Mail,
    Shield,
    Banknote,
    Plug,
    ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

// ─── Nav item type ─────────────────────────────────────────

interface NavItem {
    label: string;
    href: string;
    icon: React.ElementType;
    badge?: string;
}

interface NavGroup {
    title: string;
    items: NavItem[];
}

// ─── Route definitions ─────────────────────────────────────

const navGroups: NavGroup[] = [
    {
        title: 'Menu',
        items: [
            { label: 'Dashboard',    href: '/admin/overview',      icon: LayoutDashboard },
            { label: 'Bookings',     href: '/admin/bookings',       icon: CalendarRange },
            { label: 'Customers',    href: '/admin/customers',      icon: Users },
            { label: 'Users',        href: '/admin/users',          icon: Shield },
            { label: 'Suppliers',    href: '/admin/suppliers',      icon: Building2 },
            { label: 'Revenue',      href: '/admin/revenue',        icon: Banknote },
        ],
    },
    {
        title: 'General',
        items: [
            { label: 'Communication', href: '/admin/communication', icon: Mail },
            { label: 'Analytics',     href: '/admin/analytics',     icon: BarChart3 },
            { label: 'Settings',      href: '/admin/settings',      icon: Settings },
        ],
    },
    {
        title: 'Integrations',
        items: [
            { label: 'Duffel', href: '/admin/duffel', icon: Plane, badge: 'Live' },
        ],
    },
];

// ─── Props ─────────────────────────────────────────────────

interface SidebarProps {
    onClose?: () => void;
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
}

// ─── Single nav link ───────────────────────────────────────

function NavLink({
    item,
    isActive,
    isCollapsed,
    onClick,
}: {
    item: NavItem;
    isActive: boolean;
    isCollapsed: boolean;
    onClick?: () => void;
}) {
    return (
        <Link href={item.href} onClick={onClick}>
            <motion.div
                title={isCollapsed ? item.label : undefined}
                className={`relative group flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-4'} py-3 cursor-pointer transition-all duration-300 ${
                    isActive ? 'text-white' : 'text-slate-500 hover:text-blue-600'
                }`}
            >
                {/* Active left marker */}
                {isActive && (
                    <motion.div
                        layoutId="sidebar-marker"
                        className="absolute left-0 w-1.5 h-6 bg-blue-500 rounded-r-md"
                    />
                )}

                {/* Active background pill */}
                {isActive && (
                    <motion.div
                        layoutId="sidebar-active"
                        className="absolute inset-x-2 inset-y-1 bg-blue-600 rounded-xl -z-10 shadow-lg shadow-blue-600/20"
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    />
                )}

                <item.icon
                    size={20}
                    className={`${isActive ? 'text-white' : 'text-slate-400 group-hover:text-blue-500'} transition-colors shrink-0`}
                />

                {!isCollapsed && (
                    <>
                        <span className="text-sm font-bold tracking-tight flex-1">{item.label}</span>

                        {/* Badge (e.g. "Live") */}
                        {item.badge && !isActive && (
                            <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                {item.badge}
                            </span>
                        )}

                        {isActive && <ChevronRight size={14} className="ml-auto opacity-60" />}
                    </>
                )}
            </motion.div>
        </Link>
    );
}

// ─── Collapsible nav group ─────────────────────────────────

function NavGroupSection({
    group,
    pathname,
    isCollapsed,
    onClose,
    onNavigate,
}: {
    group: NavGroup;
    pathname: string;
    isCollapsed: boolean;
    onClose?: () => void;
    onNavigate?: (href: string) => void;
}) {
    const hasActive = group.items.some(item => pathname === item.href);
    const [open, setOpen] = useState(true); // groups start expanded

    return (
        <div className="space-y-1">
            {/* Group header — hidden when sidebar is collapsed */}
            {!isCollapsed && (
                <button
                    onClick={() => setOpen(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-1 group/grp"
                >
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400/80 group-hover/grp:text-slate-500 transition-colors">
                        {group.title}
                    </h4>
                    <ChevronDown
                        size={12}
                        className={`text-slate-400 transition-transform duration-200 ${open ? 'rotate-0' : '-rotate-90'}`}
                    />
                </button>
            )}

            <AnimatePresence initial={false}>
                {(open || isCollapsed) && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        className="overflow-hidden"
                    >
                        <div className="space-y-0.5 pt-1">
                            {group.items.map(item => (
                                <NavLink
                                    key={item.href}
                                    item={item}
                                    isActive={pathname === item.href}
                                    isCollapsed={isCollapsed}
                                    onClick={() => {
                                        if (onNavigate) onNavigate(item.href);
                                        if (onClose) onClose();
                                    }}
                                />
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ─── Sidebar ───────────────────────────────────────────────

export function Sidebar({ onClose, isCollapsed, onToggleCollapse }: SidebarProps) {
    const pathname = usePathname();
    const [optimisticPath, setOptimisticPath] = useState(pathname);

    React.useEffect(() => {
        setOptimisticPath(pathname);
    }, [pathname]);

    return (
        <aside
            className={`${isCollapsed ? 'w-24' : 'w-72'} h-screen flex flex-col bg-white dark:bg-obsidian border-r border-slate-100 dark:border-white/5 relative z-50 transition-all duration-300`}
        >
            {/* Logo */}
            <Link href="/" className={`p-8 flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} hover:opacity-90 transition-opacity`}>
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/30 shrink-0">
                    <Plane className="text-white" size={24} />
                </div>
                {!isCollapsed && (
                    <h1 className="text-xl font-black tracking-tighter text-slate-900 dark:text-white whitespace-nowrap">
                        Cheapest Go<span className="text-blue-600">.</span>
                    </h1>
                )}
            </Link>

            {/* Navigation */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-7 thin-scrollbar">
                {navGroups.map(group => (
                    <NavGroupSection
                        key={group.title}
                        group={group}
                        pathname={optimisticPath}
                        isCollapsed={!!isCollapsed}
                        onClose={() => {
                            if (onClose) onClose();
                        }}
                        onNavigate={setOptimisticPath}
                    />
                ))}
            </div>



            {/* Collapse toggle */}
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
