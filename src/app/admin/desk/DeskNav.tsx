'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, ChevronRight, Clock, MessageCircle } from 'lucide-react';

/**
 * The Support Desk's navigation: an inbox, the hours, and the way back.
 *
 * Deliberately short, and meant to stay short — the desk exists so that someone whose job
 * is answering chats is not reading past nineteen other sections to find the queue.
 *
 * It wears the admin sidebar's clothes on purpose: same active pill, same left marker,
 * same collapsed rail. An Agent who is also an admin moves between the two consoles all
 * day, and a desk that looked like a different product would read as a lesser one.
 *
 * The link back to the full admin is prominent on purpose. This is a workspace, not a
 * permission boundary: an admin here can reach every other screen by typing the address.
 * A short menu that implied otherwise would be worse than no menu.
 */

interface DeskNavProps {
    pathname: string;
    waiting: number;
    /** Icons only, matching the admin sidebar's collapsed rail. */
    isCollapsed?: boolean;
    /** Closes the mobile drawer once a link is followed. */
    onNavigate?: () => void;
}

const ITEMS = [
    { href: '/admin/desk', label: 'Support', icon: MessageCircle },
    { href: '/admin/desk/settings', label: 'Settings', icon: Clock },
];

export function DeskNav({ pathname, waiting, isCollapsed = false, onNavigate }: DeskNavProps) {
    return (
        <nav aria-label="Support desk" className="space-y-0.5">
            {ITEMS.map(item => {
                const isCurrent = pathname === item.href;
                const showsQueue = item.href === '/admin/desk' && waiting > 0;

                // Collapsed, the label is the only name the link has — so the queue has to
                // ride along in it, or the one number worth interrupting someone for is
                // reduced to a red dot nobody can read.
                const collapsedName = showsQueue
                    ? `${item.label}, ${waiting} waiting for a reply`
                    : item.label;

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
                                <motion.div
                                    layoutId="desk-marker"
                                    className="absolute left-0 w-1.5 h-6 bg-blue-500 rounded-r-md"
                                />
                            )}

                            {isCurrent && (
                                <motion.div
                                    layoutId="desk-active"
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
                                    <span
                                        aria-hidden
                                        className="absolute top-2 right-4 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-obsidian"
                                    />
                                )
                            ) : (
                                <>
                                    <span className="text-sm font-bold tracking-tight flex-1">{item.label}</span>

                                    {showsQueue && (
                                        <span
                                            aria-label={`${waiting} waiting for a reply`}
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
                href="/admin/overview"
                onClick={onNavigate}
                aria-label={isCollapsed ? 'Full admin' : undefined}
                title={isCollapsed ? 'Full admin' : undefined}
                className={`mt-4 flex items-center ${isCollapsed ? 'justify-center' : 'gap-2 px-4'} py-3 text-slate-400 transition-colors hover:text-blue-600`}
            >
                <ArrowLeft size={16} className="shrink-0" />
                {!isCollapsed && (
                    <span className="text-xs font-bold tracking-tight">Full admin</span>
                )}
            </Link>
        </nav>
    );
}
